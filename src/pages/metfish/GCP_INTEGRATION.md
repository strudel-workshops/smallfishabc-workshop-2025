# GCP Backend Integration Guide

This guide explains how to integrate the Metfish Protein Structure Model deployment page with a Google Cloud Platform (GCP) backend.

## Overview

The frontend is designed to upload files and computation parameters to a GCP backend that will execute the metfish PyTorch protein structure refinement model based on the repository: https://github.com/lbl-cbg/metfish/tree/random_sample

## Required GCP Services

1. **Cloud Storage**: For storing uploaded files (data directories, checkpoint files, CSV files)
2. **Cloud Functions or Cloud Run**: For executing the computation
3. **Compute Engine** (optional): For GPU-accelerated model training

## Backend Implementation Steps

### 1. Set Up Cloud Storage

Create a Google Cloud Storage bucket to store uploaded files:

```bash
gsutil mb gs://your-metfish-bucket
```

### 2. Create API Endpoint

You can use either Cloud Functions or Cloud Run. Here's an example Cloud Function:

```python
# main.py
import os
import json
from google.cloud import storage
from flask import Flask, request, jsonify
import subprocess

app = Flask(__name__)

@app.route('/run-metfish', methods=['POST'])
def run_metfish_model():
    """
    Handle metfish protein structure model computation requests
    """
    # Get uploaded files
    data_dir = request.files.get('data_dir')
    checkpoint_file = request.files.get('checkpoint_file')
    test_csv_file = request.files.get('test_csv_file')

    # Get parameters
    num_iterations = request.form.get('num_iterations', '500')
    learning_rate = request.form.get('learning_rate', '1e-3')
    sequence_index = request.form.get('sequence_index', '0')
    save_frequency = request.form.get('save_frequency', '25')
    random_init = request.form.get('random_init', 'true') == 'true'
    saxs_ext = request.form.get('saxs_ext', '_atom_only.csv')

    # Upload files to Cloud Storage
    storage_client = storage.Client()
    bucket = storage_client.bucket('your-metfish-bucket')

    # Save files
    data_blob = bucket.blob(f'uploads/{data_dir.filename}')
    data_blob.upload_from_file(data_dir)

    checkpoint_blob = bucket.blob(f'uploads/{checkpoint_file.filename}')
    checkpoint_blob.upload_from_file(checkpoint_file)

    csv_blob = bucket.blob(f'uploads/{test_csv_file.filename}')
    csv_blob.upload_from_file(test_csv_file)

    # Construct command to run metfish model
    cmd = [
        'python',
        'src/metfish/refinement_model/train_structure.py',
        '--data_dir', f'/tmp/{data_dir.filename}',
        '--output_dir', f'/tmp/output_{sequence_index}',
        '--ckpt_path', f'/tmp/{checkpoint_file.filename}',
        '--test_csv_name', f'/tmp/{test_csv_file.filename}',
        '--saxs_ext', saxs_ext,
        '--num_iterations', num_iterations,
        '--learning_rate', learning_rate,
        '--sequence_index', sequence_index,
        '--save_frequency', save_frequency,
    ]

    if random_init:
        cmd.append('--random_init')

    # Execute the command (in production, use Cloud Run or Compute Engine)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)

        return jsonify({
            'status': 'success',
            'output': result.stdout,
            'message': 'Computation completed successfully'
        }), 200
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

### 3. Deploy Backend

For Cloud Run:

```bash
# Build Docker container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/metfish-api

# Deploy to Cloud Run
gcloud run deploy metfish-api \
  --image gcr.io/YOUR_PROJECT_ID/metfish-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 8Gi \
  --timeout 3600
```

### 4. Update Frontend Configuration

In the frontend code (`src/pages/metfish/_layout/index.tsx`), replace the TODO section in `handleRunComputation`:

```typescript
// Replace this section:
// TODO: Replace with your actual GCP API endpoint
// const response = await fetch('https://YOUR_GCP_ENDPOINT/run-metfish', {
//   method: 'POST',
//   body: formData,
// });

// With your actual GCP endpoint:
const response = await fetch('https://YOUR_CLOUD_RUN_URL/run-metfish', {
  method: 'POST',
  body: formData,
});

if (!response.ok) {
  throw new Error('API request failed');
}

const data = await response.json();
setResults(data.message);
```

## Environment Variables

Create a `.env` file with:

```
VITE_GCP_API_ENDPOINT=https://your-cloud-run-url.run.app/run-metfish
VITE_GCP_BUCKET_NAME=your-metfish-bucket
```

## Security Considerations

1. **Authentication**: Implement proper authentication (Firebase Auth, OAuth 2.0)
2. **CORS**: Configure CORS headers on your backend
3. **File Validation**: Validate file types and sizes
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **IAM Permissions**: Use least-privilege IAM roles

## Model Parameters Reference

Based on the metfish repository, the following parameters are used:

- `--data_dir`: Directory containing input data
- `--output_dir`: Directory for output results
- `--ckpt_path`: Path to model checkpoint file
- `--test_csv_name`: Path to test CSV file
- `--saxs_ext`: Extension for SAXS data files (default: `_atom_only.csv`)
- `--num_iterations`: Number of training iterations (default: 500)
- `--learning_rate`: Learning rate for optimization (default: 1e-3)
- `--sequence_index`: Index of sequence to process
- `--save_frequency`: How often to save checkpoints
- `--random_init`: Flag for random initialization

## Cost Optimization

1. Use Cloud Storage lifecycle policies to delete old files
2. Set up auto-scaling for Cloud Run
3. Consider using preemptible VMs for Compute Engine
4. Implement job queuing for batch processing

## Monitoring and Logging

1. Enable Cloud Logging for your Cloud Run/Functions
2. Set up Cloud Monitoring alerts
3. Track execution metrics (duration, success rate, errors)

## Next Steps

1. Set up GCP project and enable required APIs
2. Deploy the backend service
3. Update frontend with your GCP endpoint URL
4. Test end-to-end functionality
5. Set up monitoring and alerts
