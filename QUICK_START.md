# Metfish Deployment - Quick Start Guide

This is your complete guide to deploy the metfish protein structure model using your existing GCP infrastructure.

## Your GCP Resources

✅ **Buckets:**

- `metfish-input` - For uploaded input files
- `metfishi-checkpoints` - Contains pre-trained checkpoints
- `metfish-results` - For computation results

✅ **GPU Instance:** L4 GPU instance for inference

## Quick Setup (3 Steps)

### Step 1: Deploy API on Your GPU Instance

SSH into your GPU instance and run these commands:

```bash
# Create API directory
mkdir -p ~/metfish-api
cd ~/metfish-api

# Download the Python API server code from DEPLOY_TO_EXISTING_GCP.md
# Copy the main.py and requirements.txt content from that guide

# Install dependencies
pip3 install -r requirements.txt

# Set up your GCP credentials (if not already done)
# Download your service account key and set:
export GOOGLE_APPLICATION_CREDENTIALS=~/metfish-key.json

# Run the API server
python3 main.py
```

For production, set up as a systemd service (see DEPLOY_TO_EXISTING_GCP.md Step 5)

### Step 2: Configure Firewall

```bash
# Allow traffic to port 8080
gcloud compute firewall-rules create allow-metfish-api \
    --allow tcp:8080 \
    --source-ranges 0.0.0.0/0 \
    --description="Allow Metfish API traffic"
```

### Step 3: Configure Your Frontend

Get your GPU instance's external IP:

```bash
gcloud compute instances describe YOUR_INSTANCE_NAME --zone=YOUR_ZONE \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

Create `.env` file in your project root:

```bash
VITE_GCP_API_URL=http://YOUR_INSTANCE_EXTERNAL_IP:8080
```

Example:

```
VITE_GCP_API_URL=http://34.123.45.67:8080
```

Restart the dev server:

```bash
# The server should restart automatically, or press Ctrl+C and run:
npm run dev
```

## Using the Application

1. **Navigate to:** `http://localhost:5175/metfish`

2. **Upload Files:**

   - Data Directory (ZIP file with protein structure data)
   - Test CSV File (with test sequences)

3. **Select Checkpoint:**

   - The UI will automatically load checkpoints from `metfishi-checkpoints` bucket
   - Select the one you want to use

4. **Configure Parameters:**

   - Number of Iterations (default: 500)
   - Learning Rate (default: 1e-3)
   - Sequence Index (default: 0)
   - Save Frequency (default: 25)
   - SAXS Extension (default: \_atom_only.csv)
   - Random Initialization (checkbox)

5. **Run Computation:**
   - Click "Run Computation"
   - Monitor progress on the GPU
   - Results will be saved to `gs://metfish-results/`

## Monitoring

### Check API Status

```bash
curl http://YOUR_INSTANCE_EXTERNAL_IP:8080/health
```

### View API Logs

```bash
# On GPU instance
sudo journalctl -u metfish-api -f
```

### Monitor GPU Usage

```bash
# On GPU instance
watch -n 1 nvidia-smi
```

### View Results

```bash
# List all results
gsutil ls gs://metfish-results/

# Download specific job results
gsutil -m cp -r gs://metfish-results/job_XXXXX ./local-results/
```

## File Structure

```
metfish-deployment/
├── QUICK_START.md              ← You are here
├── DEPLOY_TO_EXISTING_GCP.md   ← Detailed deployment guide
├── GCP_SETUP_GUIDE.md          ← General GCP setup (for reference)
├── .env.example                ← Environment variable template
├── .env                        ← Your actual configuration (create this)
└── src/pages/metfish/          ← Frontend code
    ├── _layout.tsx
    ├── _layout/
    │   └── index.tsx           ← Main metfish UI
    ├── README.md
    └── GCP_INTEGRATION.md
```

## Troubleshooting

### Checkpoints not loading?

- Check `.env` file has correct `VITE_GCP_API_URL`
- Verify API is running: `curl http://YOUR_IP:8080/health`
- Check browser console for errors

### Computation fails?

- View GPU instance logs: `sudo journalctl -u metfish-api -f`
- Check GPU memory: `nvidia-smi`
- Verify bucket permissions

### Can't access API?

- Check firewall rule: `gcloud compute firewall-rules list | grep metfish`
- Verify instance external IP
- Test with curl: `curl http://YOUR_IP:8080/health`

## Cost Management

**Remember to stop your GPU instance when not in use!**

```bash
# Stop instance
gcloud compute instances stop YOUR_INSTANCE_NAME --zone=YOUR_ZONE

# Start instance when needed
gcloud compute instances start YOUR_INSTANCE_NAME --zone=YOUR_ZONE
```

L4 GPU instances are expensive (~$0.75-1.50/hour depending on region)

## Next Steps

1. ✅ Follow the 3 steps above to deploy
2. ✅ Test with a small dataset first
3. ✅ Monitor costs in GCP Console
4. ✅ Set up billing alerts
5. ✅ Consider using preemptible instances for non-critical workloads

## Need Help?

- **Detailed Deployment:** See `DEPLOY_TO_EXISTING_GCP.md`
- **Frontend Details:** See `src/pages/metfish/README.md`
- **GCP Integration:** See `src/pages/metfish/GCP_INTEGRATION.md`

## API Endpoints

Your API provides these endpoints:

- `GET /health` - Health check
- `GET /list-checkpoints` - List available checkpoints from bucket
- `POST /run-metfish` - Run computation (used by frontend)
- `GET /get-results/<job_id>` - Get results for a specific job

Happy computing! 🚀
