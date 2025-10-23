# Deploy Metfish to Your Existing GCP Infrastructure

This guide will help you deploy metfish to your existing GCP setup with L4 GPU instance.

## Your Existing Resources

- **Buckets:**
  - `metfish-input` - For uploaded input files
  - `metfishi-checkpoints` - Contains pre-trained checkpoints
  - `metfish-results` - For computation results
- **Compute Instance:** L4 GPU instance for inference

## Step 1: Connect to Your GPU Instance

```bash
# SSH into your GPU instance
# Replace INSTANCE_NAME and ZONE with your actual values
gcloud compute ssh INSTANCE_NAME --zone=ZONE

# Example:
# gcloud compute ssh metfish-gpu --zone=us-central1-a
```

## Step 2: Install Dependencies on GPU Instance

```bash
# Update system
sudo apt-get update
sudo apt-get install -y python3-pip git

# Install CUDA and PyTorch (if not already installed)
pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# Install Google Cloud Storage client
pip3 install google-cloud-storage flask flask-cors

# Clone metfish repository
cd ~
git clone https://github.com/lbl-cbg/metfish.git
cd metfish
pip3 install -e .
```

## Step 3: Create API Server on GPU Instance

Create `~/metfish-api/main.py`:

```python
from flask import Flask, request, jsonify
from google.cloud import storage
from flask_cors import CORS
import os
import tempfile
import subprocess
import json

app = Flask(__name__)
CORS(app)

# Your bucket names
INPUT_BUCKET = 'metfish-input'
CHECKPOINT_BUCKET = 'metfishi-checkpoints'
RESULTS_BUCKET = 'metfish-results'

# Initialize storage client
storage_client = storage.Client()

def download_from_bucket(bucket_name, blob_name, local_path):
    """Download a file from GCS bucket"""
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.download_to_filename(local_path)
    return local_path

def upload_to_bucket(bucket_name, local_path, blob_name):
    """Upload a file to GCS bucket"""
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(blob_name)
    blob.upload_from_filename(local_path)
    return f"gs://{bucket_name}/{blob_name}"

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'gpu': 'available'}), 200

@app.route('/list-checkpoints', methods=['GET'])
def list_checkpoints():
    """List available checkpoints from the checkpoint bucket"""
    try:
        bucket = storage_client.bucket(CHECKPOINT_BUCKET)
        blobs = bucket.list_blobs()
        checkpoints = [blob.name for blob in blobs if blob.name.endswith('.ckpt')]
        return jsonify({
            'status': 'success',
            'checkpoints': checkpoints
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/run-metfish', methods=['POST'])
def run_metfish():
    """Execute metfish computation"""
    try:
        # Get uploaded files
        data_file = request.files.get('data_dir')
        csv_file = request.files.get('test_csv_file')

        # Get checkpoint name from form (user selects from available checkpoints)
        checkpoint_name = request.form.get('checkpoint_file', 'default.ckpt')

        # Get parameters
        params = {
            'num_iterations': request.form.get('num_iterations', '500'),
            'learning_rate': request.form.get('learning_rate', '1e-3'),
            'sequence_index': request.form.get('sequence_index', '0'),
            'save_frequency': request.form.get('save_frequency', '25'),
            'random_init': request.form.get('random_init', 'true') == 'true',
            'saxs_ext': request.form.get('saxs_ext', '_atom_only.csv')
        }

        # Create unique job ID
        import time
        job_id = f"job_{int(time.time())}_{params['sequence_index']}"

        with tempfile.TemporaryDirectory() as tmpdir:
            # Save uploaded files
            data_path = os.path.join(tmpdir, 'data.zip')
            csv_path = os.path.join(tmpdir, 'test.csv')
            checkpoint_path = os.path.join(tmpdir, 'checkpoint.ckpt')
            output_path = os.path.join(tmpdir, 'output')

            # Save uploaded files
            data_file.save(data_path)
            csv_file.save(csv_path)

            # Download checkpoint from bucket
            print(f"Downloading checkpoint: {checkpoint_name}")
            download_from_bucket(CHECKPOINT_BUCKET, checkpoint_name, checkpoint_path)

            # Extract data if it's a zip
            if data_path.endswith('.zip'):
                import zipfile
                data_extract_path = os.path.join(tmpdir, 'data')
                os.makedirs(data_extract_path, exist_ok=True)
                with zipfile.ZipFile(data_path, 'r') as zip_ref:
                    zip_ref.extractall(data_extract_path)
                data_path = data_extract_path

            os.makedirs(output_path, exist_ok=True)

            # Upload input files to input bucket for record
            upload_to_bucket(INPUT_BUCKET, csv_path, f"{job_id}/test.csv")

            # Build metfish command
            cmd = [
                'python3',
                os.path.expanduser('~/metfish/src/metfish/refinement_model/train_structure.py'),
                '--data_dir', data_path,
                '--output_dir', output_path,
                '--ckpt_path', checkpoint_path,
                '--test_csv_name', csv_path,
                '--saxs_ext', params['saxs_ext'],
                '--num_iterations', params['num_iterations'],
                '--learning_rate', params['learning_rate'],
                '--sequence_index', params['sequence_index'],
                '--save_frequency', params['save_frequency']
            ]

            if params['random_init']:
                cmd.append('--random_init')

            print(f"Running command: {' '.join(cmd)}")

            # Run computation on GPU
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=7200  # 2 hour timeout
            )

            if result.returncode == 0:
                # Upload results to results bucket
                uploaded_files = []
                for root, dirs, files in os.walk(output_path):
                    for file in files:
                        local_path = os.path.join(root, file)
                        rel_path = os.path.relpath(local_path, output_path)
                        blob_name = f"{job_id}/{rel_path}"
                        gcs_path = upload_to_bucket(RESULTS_BUCKET, local_path, blob_name)
                        uploaded_files.append(gcs_path)

                return jsonify({
                    'status': 'success',
                    'message': 'Computation completed successfully',
                    'job_id': job_id,
                    'results': uploaded_files,
                    'output': result.stdout[-1000:]  # Last 1000 chars
                }), 200
            else:
                return jsonify({
                    'status': 'error',
                    'message': 'Computation failed',
                    'error': result.stderr[-1000:]
                }), 500

    except subprocess.TimeoutExpired:
        return jsonify({
            'status': 'error',
            'message': 'Computation timed out after 2 hours'
        }), 500
    except Exception as e:
        import traceback
        return jsonify({
            'status': 'error',
            'message': str(e),
            'traceback': traceback.format_exc()
        }), 500

@app.route('/get-results/<job_id>', methods=['GET'])
def get_results(job_id):
    """Get results for a specific job"""
    try:
        bucket = storage_client.bucket(RESULTS_BUCKET)
        blobs = bucket.list_blobs(prefix=job_id)
        results = [f"gs://{RESULTS_BUCKET}/{blob.name}" for blob in blobs]
        return jsonify({
            'status': 'success',
            'job_id': job_id,
            'results': results
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    # Run on all interfaces so it's accessible from outside
    app.run(host='0.0.0.0', port=8080, debug=False)
```

Create `~/metfish-api/requirements.txt`:

```txt
flask==3.0.0
flask-cors==4.0.0
google-cloud-storage==2.10.0
```

Install dependencies:

```bash
cd ~/metfish-api
pip3 install -r requirements.txt
```

## Step 4: Set Up Service Account (on GPU Instance)

```bash
# If you haven't already, create a service account key
# Run this on your local machine:
gcloud iam service-accounts create metfish-compute \
    --display-name="Metfish Compute Service Account"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:metfish-compute@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
    --role="roles/storage.objectAdmin"

gcloud iam service-accounts keys create ~/metfish-key.json \
    --iam-account=metfish-compute@YOUR_PROJECT_ID.iam.gserviceaccount.com

# Copy the key to your GPU instance
gcloud compute scp ~/metfish-key.json INSTANCE_NAME:~/metfish-key.json --zone=ZONE

# On the GPU instance, set the environment variable
echo 'export GOOGLE_APPLICATION_CREDENTIALS=~/metfish-key.json' >> ~/.bashrc
source ~/.bashrc
```

## Step 5: Run the API Server

```bash
# Test run
cd ~/metfish-api
python3 main.py

# For production, use systemd service
sudo nano /etc/systemd/system/metfish-api.service
```

Add this content to the service file:

```ini
[Unit]
Description=Metfish API Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/metfish-api
Environment="GOOGLE_APPLICATION_CREDENTIALS=/home/YOUR_USERNAME/metfish-key.json"
ExecStart=/usr/bin/python3 /home/YOUR_USERNAME/metfish-api/main.py
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable metfish-api
sudo systemctl start metfish-api
sudo systemctl status metfish-api
```

## Step 6: Configure Firewall

```bash
# Allow port 8080 on your GPU instance
gcloud compute firewall-rules create allow-metfish-api \
    --allow tcp:8080 \
    --source-ranges 0.0.0.0/0 \
    --description="Allow Metfish API traffic"
```

## Step 7: Get Your Instance External IP

```bash
gcloud compute instances describe INSTANCE_NAME --zone=ZONE \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
```

## Step 8: Configure Your Frontend

Create `.env` file in your project root:

```bash
# Use your instance's external IP
VITE_GCP_API_URL=http://YOUR_INSTANCE_EXTERNAL_IP:8080
```

Example:

```
VITE_GCP_API_URL=http://34.123.45.67:8080
```

## Step 9: Test the Connection

```bash
# From your local machine, test the API
curl http://YOUR_INSTANCE_EXTERNAL_IP:8080/health

# Should return: {"status":"healthy","gpu":"available"}

# List available checkpoints
curl http://YOUR_INSTANCE_EXTERNAL_IP:8080/list-checkpoints
```

## Step 10: Restart Your Frontend

```bash
# Stop the current dev server (Ctrl+C)
# Start it again to load the new environment variables
npm run dev
```

Now navigate to `http://localhost:5175/metfish` and test!

## Monitoring and Troubleshooting

### View API Logs

```bash
# On GPU instance
sudo journalctl -u metfish-api -f
```

### Check GPU Usage

```bash
# On GPU instance
nvidia-smi

# Watch GPU usage in real-time
watch -n 1 nvidia-smi
```

### Check Storage

```bash
# List files in buckets
gsutil ls gs://metfish-input/
gsutil ls gs://metfishi-checkpoints/
gsutil ls gs://metfish-results/
```

### Download Results

```bash
# Download all results for a job
gsutil -m cp -r gs://metfish-results/job_XXXXX ./local-results/
```

## Security Notes

For production:

1. Use HTTPS (set up SSL certificate)
2. Add authentication to your API
3. Use internal IPs and VPN if possible
4. Implement request rate limiting
5. Set up monitoring and alerts

## Cost Optimization

- Stop the GPU instance when not in use
- Use preemptible instances for non-critical workloads
- Set up lifecycle policies on buckets to delete old files
