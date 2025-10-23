# GCP Bucket Permissions Setup Guide

This guide will help you set up the correct permissions to access your GCP buckets from the metfish API.

## Your Buckets

- `metfish-input` - For uploaded input files
- `metfishi-checkpoints` - Contains pre-trained checkpoints
- `metfish-results` - For computation results

## Option 1: Using Compute Engine Service Account (Recommended)

If your GPU instance is a GCP Compute Engine instance, it already has a default service account.

### Step 1: Grant Bucket Permissions

Run these commands **on your local machine** (not on the GPU instance):

```bash
# Get your project ID
export PROJECT_ID=$(gcloud config get-value project)

# Get the GPU instance's service account email
export INSTANCE_NAME="YOUR_INSTANCE_NAME"  # Replace with your instance name
export ZONE="YOUR_ZONE"  # e.g., us-central1-a

export SERVICE_ACCOUNT=$(gcloud compute instances describe $INSTANCE_NAME \
  --zone=$ZONE \
  --format='get(serviceAccounts[0].email)')

echo "Service Account: $SERVICE_ACCOUNT"

# Grant Storage Object Admin role for all three buckets
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfish-input
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfishi-checkpoints
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfish-results

echo "✅ Permissions granted!"
```

### Step 2: Verify Permissions

On your GPU instance, test the access:

```bash
# List checkpoints
gsutil ls gs://metfishi-checkpoints/

# Should show your checkpoint files
```

### Step 3: No Additional Configuration Needed!

Your Python API code will automatically use the Compute Engine service account. No need to set `GOOGLE_APPLICATION_CREDENTIALS`.

**Remove this line from main.py if you added it:**

```python
# os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = '/path/to/key.json'  # NOT NEEDED
```

## Option 2: Using a Service Account Key File

If you prefer to use a separate service account or need more control:

### Step 1: Create Service Account

```bash
# Set your project
export PROJECT_ID=$(gcloud config get-value project)

# Create service account
gcloud iam service-accounts create metfish-api \
    --display-name="Metfish API Service Account" \
    --project=$PROJECT_ID

# Get the service account email
export SA_EMAIL="metfish-api@${PROJECT_ID}.iam.gserviceaccount.com"
echo "Service Account: $SA_EMAIL"
```

### Step 2: Grant Bucket Permissions

```bash
# Grant permissions to all three buckets
gsutil iam ch serviceAccount:${SA_EMAIL}:objectAdmin gs://metfish-input
gsutil iam ch serviceAccount:${SA_EMAIL}:objectAdmin gs://metfishi-checkpoints
gsutil iam ch serviceAccount:${SA_EMAIL}:objectAdmin gs://metfish-results
```

### Step 3: Create and Download Key

```bash
# Create key file
gcloud iam service-accounts keys create ~/metfish-key.json \
    --iam-account=$SA_EMAIL

echo "✅ Key file created: ~/metfish-key.json"
```

### Step 4: Copy Key to GPU Instance

```bash
# Copy key to your GPU instance
gcloud compute scp ~/metfish-key.json ${INSTANCE_NAME}:~/metfish-key.json --zone=$ZONE

echo "✅ Key copied to GPU instance"
```

### Step 5: Configure on GPU Instance

SSH to your GPU instance and run:

```bash
# Set environment variable permanently
echo 'export GOOGLE_APPLICATION_CREDENTIALS=~/metfish-key.json' >> ~/.bashrc
source ~/.bashrc

# Verify it works
gsutil ls gs://metfishi-checkpoints/
```

### Step 6: Update systemd Service (if using)

If you set up the API as a systemd service, update the service file:

```bash
sudo nano /etc/systemd/system/metfish-api.service
```

Make sure it includes:

```ini
[Service]
Environment="GOOGLE_APPLICATION_CREDENTIALS=/home/YOUR_USERNAME/metfish-key.json"
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart metfish-api
```

## Testing Bucket Access

### Test from GPU Instance

```bash
# Test reading checkpoints bucket
gsutil ls gs://metfishi-checkpoints/

# Test writing to input bucket
echo "test" > test.txt
gsutil cp test.txt gs://metfish-input/test.txt
gsutil rm gs://metfish-input/test.txt
rm test.txt

# Test writing to results bucket
echo "test result" > result.txt
gsutil cp result.txt gs://metfish-results/test-result.txt
gsutil rm gs://metfish-results/test-result.txt
rm result.txt

echo "✅ All bucket tests passed!"
```

### Test API Endpoints

Once your API is running:

```bash
# Get your GPU instance external IP
export GPU_IP=$(gcloud compute instances describe $INSTANCE_NAME \
  --zone=$ZONE \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

# Test health endpoint
curl http://$GPU_IP:8080/health

# Test list checkpoints (should return your checkpoints)
curl http://$GPU_IP:8080/list-checkpoints
```

## Troubleshooting

### Error: "403 Forbidden" or "Access Denied"

**Solution:** Check bucket permissions

```bash
# View current permissions
gsutil iam get gs://metfishi-checkpoints

# Re-grant permissions
gsutil iam ch serviceAccount:YOUR_SERVICE_ACCOUNT:objectAdmin gs://metfishi-checkpoints
```

### Error: "Application Default Credentials not found"

**Solution:** Set up credentials

```bash
# If using Option 1 (Compute Engine), this shouldn't happen
# If using Option 2, make sure:
export GOOGLE_APPLICATION_CREDENTIALS=~/metfish-key.json

# Test
python3 -c "from google.cloud import storage; print(storage.Client().list_buckets())"
```

### Error: "File not found" when accessing buckets

**Solution:** Check bucket names in your code

In `main.py`, verify these exact names:

```python
INPUT_BUCKET = 'metfish-input'
CHECKPOINT_BUCKET = 'metfishi-checkpoints'  # Note: metfishI not metfish
RESULTS_BUCKET = 'metfish-results'
```

### Verify Your Bucket Names

```bash
# List all your buckets to confirm exact names
gsutil ls

# Should show:
# gs://metfish-input/
# gs://metfishi-checkpoints/
# gs://metfish-results/
```

## Security Best Practices

### For Production:

1. **Use Compute Engine service account** (Option 1) - more secure, no key files
2. **Limit bucket access** to only what's needed:

   ```bash
   # Read-only for checkpoints
   gsutil iam ch serviceAccount:${SA_EMAIL}:objectViewer gs://metfishi-checkpoints

   # Read-write for input and results
   gsutil iam ch serviceAccount:${SA_EMAIL}:objectAdmin gs://metfish-input
   gsutil iam ch serviceAccount:${SA_EMAIL}:objectAdmin gs://metfish-results
   ```

3. **Rotate keys regularly** if using Option 2

4. **Delete old keys**:
   ```bash
   gcloud iam service-accounts keys list --iam-account=$SA_EMAIL
   gcloud iam service-accounts keys delete KEY_ID --iam-account=$SA_EMAIL
   ```

## Summary

**Recommended Approach:** Use Option 1 (Compute Engine Service Account)

**Quick Commands:**

```bash
# On your local machine:
export PROJECT_ID=$(gcloud config get-value project)
export INSTANCE_NAME="your-gpu-instance"
export ZONE="us-central1-a"
export SERVICE_ACCOUNT=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --format='get(serviceAccounts[0].email)')

# Grant permissions
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfish-input
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfishi-checkpoints
gsutil iam ch serviceAccount:${SERVICE_ACCOUNT}:objectAdmin gs://metfish-results

# Test on GPU instance:
gsutil ls gs://metfishi-checkpoints/
```

Done! Your API will now have access to all three buckets.
