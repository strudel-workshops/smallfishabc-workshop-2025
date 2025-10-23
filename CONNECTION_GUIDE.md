# How to Connect Your Frontend to GCP Backend

This guide explains how the frontend (running here) connects to your GCP GPU instance.

## Architecture Overview

```
┌─────────────────────────┐
│   Your Local Machine    │
│  (JupyterHub/Notebook)  │
│                         │
│  ┌───────────────────┐  │
│  │   Frontend (UI)   │  │
│  │  localhost:5175   │  │
│  │  /metfish page    │  │
│  └─────────┬─────────┘  │
│            │             │
│            │ HTTP Request
│            │ (File Upload + Params)
│            ▼             │
│     .env file says:      │
│  VITE_GCP_API_URL=       │
│  http://34.x.x.x:8080    │
└─────────────────────────┘
            │
            │ Internet
            ▼
┌─────────────────────────┐
│   GCP GPU Instance      │
│   (L4 GPU)              │
│                         │
│  ┌───────────────────┐  │
│  │  Python API       │  │
│  │  Flask Server     │  │
│  │  Port 8080        │  │
│  └─────────┬─────────┘  │
│            │             │
│            │ Access via  │
│            │ Service     │
│            │ Account     │
│            ▼             │
│  ┌───────────────────┐  │
│  │  Run Metfish      │  │
│  │  on GPU           │  │
│  └─────────┬─────────┘  │
└────────────┼─────────────┘
             │
             │ Read/Write
             ▼
┌─────────────────────────┐
│   GCP Storage Buckets   │
│                         │
│  • metfish-input        │
│  • metfishi-checkpoints │
│  • metfish-results      │
└─────────────────────────┘
```

## Step-by-Step Connection Process

### Step 1: Deploy Backend API on Your GCP GPU Instance

**What:** Install Python API server on your GPU instance
**Where:** SSH to your GPU instance

```bash
# SSH to your GPU instance
gcloud compute ssh YOUR_INSTANCE_NAME --zone=YOUR_ZONE

# Create API directory
mkdir -p ~/metfish-api
cd ~/metfish-api

# Create main.py (copy from DEPLOY_TO_EXISTING_GCP.md Step 3)
nano main.py
# Paste the Python code

# Create requirements.txt
nano requirements.txt
# Add:
# flask==3.0.0
# flask-cors==4.0.0
# google-cloud-storage==2.10.0

# Install dependencies
pip3 install -r requirements.txt

# Run the API server
python3 main.py
```

The server will start on port 8080 and show:

```
 * Running on http://0.0.0.0:8080
```

### Step 2: Get Your GPU Instance's External IP Address

**What:** Find the IP address that the frontend will connect to
**Where:** On your local machine

```bash
# Get the external IP
gcloud compute instances describe YOUR_INSTANCE_NAME \
  --zone=YOUR_ZONE \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# Example output: 34.123.45.67
```

Copy this IP address - you'll need it in the next step.

### Step 3: Configure Frontend to Connect to Backend

**What:** Tell the frontend where to send requests
**Where:** In this project directory (where you are now)

Create a `.env` file:

```bash
# Create .env file with your GPU instance IP
echo "VITE_GCP_API_URL=http://YOUR_GPU_IP:8080" > .env

# Example:
# echo "VITE_GCP_API_URL=http://34.123.45.67:8080" > .env
```

The dev server will automatically reload and pick up this configuration.

### Step 4: Open Firewall (if not already done)

**What:** Allow traffic to port 8080 on your GPU instance
**Where:** On your local machine

```bash
gcloud compute firewall-rules create allow-metfish-api \
  --allow tcp:8080 \
  --source-ranges 0.0.0.0/0 \
  --description="Allow Metfish API traffic"
```

### Step 5: Test the Connection

**Test 1: From your local machine**

```bash
# Replace with your actual GPU IP
curl http://YOUR_GPU_IP:8080/health

# Should return: {"status":"healthy","gpu":"available"}
```

**Test 2: Check checkpoint loading**

```bash
curl http://YOUR_GPU_IP:8080/list-checkpoints

# Should return: {"status":"success","checkpoints":["checkpoint1.ckpt", ...]}
```

**Test 3: Open the UI**

1. Open browser to: `http://localhost:5175/metfish`
2. You should see checkpoints automatically loaded in the dropdown
3. If you see "No checkpoints found" - check your .env file and API status

## How Data Flows

### When you submit a computation:

1. **Frontend (Here)** →

   - User uploads files (ZIP + CSV)
   - Selects checkpoint from dropdown
   - Sets parameters
   - Clicks "Run Computation"

2. **HTTP Request** →

   - Frontend sends POST request to `http://YOUR_GPU_IP:8080/run-metfish`
   - Contains: uploaded files + selected checkpoint name + parameters

3. **GCP GPU Instance** →

   - API receives the request
   - Downloads selected checkpoint from `metfishi-checkpoints` bucket
   - Saves uploaded files to `metfish-input` bucket
   - Runs metfish computation on GPU
   - Uploads results to `metfish-results` bucket
   - Returns job ID to frontend

4. **Frontend Shows** →
   - "Computation completed!"
   - Job ID: job_1234567_0
   - Results location: gs://metfish-results/job_1234567_0/

## Verification Checklist

✅ **Backend Running?**

```bash
# SSH to GPU instance
curl localhost:8080/health
# Should return: {"status":"healthy","gpu":"available"}
```

✅ **Firewall Open?**

```bash
gcloud compute firewall-rules list | grep metfish
# Should show: allow-metfish-api
```

✅ **Frontend Configured?**

```bash
# In your project directory
cat .env
# Should show: VITE_GCP_API_URL=http://YOUR_GPU_IP:8080
```

✅ **Can Reach API from Local Machine?**

```bash
curl http://YOUR_GPU_IP:8080/health
# Should return: {"status":"healthy","gpu":"available"}
```

✅ **Checkpoints Loading in UI?**

- Open http://localhost:5175/metfish
- Check the checkpoint dropdown
- Should show checkpoints from your bucket

## Troubleshooting

### Frontend can't connect to backend

**Check .env file:**

```bash
cat .env
# Make sure the IP is correct
```

**Test API directly:**

```bash
curl http://YOUR_GPU_IP:8080/health
```

If curl fails:

- ✓ Check GPU instance is running
- ✓ Check API is running on GPU instance
- ✓ Check firewall rule exists
- ✓ Check IP address is external IP, not internal

### Checkpoints not showing in UI

**Check browser console:**

- Press F12 in browser
- Look for errors in Console tab
- Should see API requests to /list-checkpoints

**Check API response:**

```bash
curl http://YOUR_GPU_IP:8080/list-checkpoints
```

Should return list of .ckpt files from your bucket.

### CORS errors in browser

This means the API needs CORS headers. The Python code already includes:

```python
from flask_cors import CORS
CORS(app)
```

Make sure you installed flask-cors:

```bash
# On GPU instance
pip3 install flask-cors
```

## Summary

**Frontend (Here)** ← Connects via HTTP → **Backend (GCP GPU)** ← Connects via Service Account → **Buckets (GCP Storage)**

**Key Configuration:**

- `.env` file tells frontend where backend is
- Backend uses service account to access buckets
- Firewall allows port 8080 traffic

**To Start Using:**

1. Deploy backend API on GPU instance
2. Get GPU instance external IP
3. Create .env file with that IP
4. Open http://localhost:5175/metfish
5. Select checkpoint and upload files
6. Click "Run Computation"

Done! 🚀
