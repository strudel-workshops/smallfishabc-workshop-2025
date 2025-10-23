# Quick GCP Setup Guide for Metfish

This guide will help you connect your Metfish frontend to a GCP backend.

## Prerequisites

- A Google Cloud Platform account
- `gcloud` CLI installed (https://cloud.google.com/sdk/docs/install)
- Your metfish model code from https://github.com/lbl-cbg/metfish

## Step 1: Set Up Your GCP Project

```bash
# Login to GCP
gcloud auth login

# Create a new project (or use existing)
gcloud projects create metfish-project --name="Metfish Deployment"

# Set the project
gcloud config set project metfish-project

# Enable required APIs
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable storage.googleapis.com
```

## Step 2: Create Cloud Storage Bucket

```bash
# Create bucket for file uploads
gsutil mb gs://metfish-uploads

# Set CORS for the bucket (allows frontend to upload)
cat > cors.json << EOF
[
  {
    "origin": ["http://localhost:5175"],
    "method": ["GET", "POST"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF

gsutil cors set cors.json gs://metfish-uploads
```

## Step 3: Create the Backend API

Create a new directory for your backend:

```bash
mkdir metfish-backend
cd metfish-backend
```

Create `main.py`:

```python
from flask import Flask, request, jsonify
from google.cloud import storage
import os
import tempfile
import subprocess
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend access

BUCKET_NAME = 'metfish-uploads'

@app.route('/run-metfish', methods=['POST'])
def run_metfish():
    try:
        # Get uploaded files
        data_file = request.files.get('data_dir')
        checkpoint_file = request.files.get('checkpoint_file')
        csv_file = request.files.get('test_csv_file')

        # Get parameters
        params = {
            'num_iterations': request.form.get('num_iterations', '500'),
            'learning_rate': request.form.get('learning_rate', '1e-3'),
            'sequence_index': request.form.get('sequence_index', '0'),
            'save_frequency': request.form.get('save_frequency', '25'),
            'random_init': request.form.get('random_init', 'true') == 'true',
            'saxs_ext': request.form.get('saxs_ext', '_atom_only.csv')
        }

        # Upload to Cloud Storage
        storage_client = storage.Client()
        bucket = storage_client.bucket(BUCKET_NAME)

        # Save files temporarily
        with tempfile.TemporaryDirectory() as tmpdir:
            # Save uploaded files
            data_path = os.path.join(tmpdir, data_file.filename)
            checkpoint_path = os.path.join(tmpdir, checkpoint_file.filename)
            csv_path = os.path.join(tmpdir, csv_file.filename)
            output_path = os.path.join(tmpdir, 'output')

            data_file.save(data_path)
            checkpoint_file.save(checkpoint_path)
            csv_file.save(csv_path)
            os.makedirs(output_path, exist_ok=True)

            # Build command
            cmd = [
                'python', 'src/metfish/refinement_model/train_structure.py',
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

            # Run computation
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

            if result.returncode == 0:
                # Upload results to Cloud Storage
                for root, dirs, files in os.walk(output_path):
                    for file in files:
                        local_path = os.path.join(root, file)
                        blob_path = f"results/{params['sequence_index']}/{file}"
                        blob = bucket.blob(blob_path)
                        blob.upload_from_filename(local_path)

                return jsonify({
                    'status': 'success',
                    'message': 'Computation completed successfully',
                    'output': result.stdout
                }), 200
            else:
                return jsonify({
                    'status': 'error',
                    'message': result.stderr
                }), 500

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

Create `requirements.txt`:

```txt
flask==3.0.0
flask-cors==4.0.0
google-cloud-storage==2.10.0
torch==2.0.0
# Add other metfish dependencies here
```

Create `Dockerfile`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y git

# Clone metfish repository
RUN git clone https://github.com/lbl-cbg/metfish.git

# Copy backend code
COPY requirements.txt .
COPY main.py .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install metfish
WORKDIR /app/metfish
RUN pip install -e .

WORKDIR /app

EXPOSE 8080

CMD ["python", "main.py"]
```

## Step 4: Deploy to Cloud Run

```bash
# Build and deploy
gcloud builds submit --tag gcr.io/metfish-project/metfish-api

gcloud run deploy metfish-api \
  --image gcr.io/metfish-project/metfish-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 8Gi \
  --timeout 3600 \
  --set-env-vars BUCKET_NAME=metfish-uploads
```

After deployment, you'll get a URL like:

```
https://metfish-api-xxxxx-uc.a.run.app
```

## Step 5: Configure Your Frontend

Create a `.env` file in your project root:

```bash
VITE_GCP_API_URL=https://metfish-api-xxxxx-uc.a.run.app
```

## Step 6: Test Your Setup

1. Start your frontend: `npm run dev`
2. Navigate to `http://localhost:5175/metfish`
3. Upload your test files:
   - Data directory (as ZIP)
   - Checkpoint file (.ckpt)
   - Test CSV file
4. Configure parameters
5. Click "Run Computation"

## Monitoring Your Jobs

### View Logs

```bash
gcloud run logs read metfish-api --limit 50
```

### Check Cloud Storage

```bash
# List uploaded files
gsutil ls gs://metfish-uploads/uploads/

# List results
gsutil ls gs://metfish-uploads/results/
```

## Cost Considerations

- **Cloud Run**: Pay only when requests are being processed
- **Cloud Storage**: ~$0.02 per GB per month
- **Network**: First 1 GB free per month

Estimated cost: ~$5-20/month for light usage

## Troubleshooting

### CORS Issues

If you get CORS errors, update the bucket CORS settings:

```bash
gsutil cors set cors.json gs://metfish-uploads
```

### Memory Issues

If you run out of memory, increase Cloud Run memory:

```bash
gcloud run services update metfish-api --memory 16Gi
```

### Timeout Issues

For long-running jobs, increase timeout:

```bash
gcloud run services update metfish-api --timeout 3600
```

## Security (Production)

For production use, add authentication:

1. Remove `--allow-unauthenticated` from Cloud Run
2. Add Firebase Authentication to your frontend
3. Use service account authentication for backend

## Next Steps

1. Deploy your backend to Cloud Run
2. Update `.env` with your Cloud Run URL
3. Test with sample data
4. Monitor costs in GCP Console
5. Set up alerts for budget limits

Need help? Check the GCP documentation or file an issue.
