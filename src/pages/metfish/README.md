# Metfish Protein Structure Model Deployment

## Overview

This interface provides a streamlined deployment system for the Metfish PyTorch-driven AI protein structure refinement model. The interface focuses on two primary actions:

1. **Upload** - Upload required data files
2. **Run Computation** - Execute the model with configured parameters

## Features

### 1. File Upload Section

Upload three required files:

- **Data Directory (ZIP)**: Contains the protein structure input data
- **Checkpoint File (.ckpt)**: Pre-trained model checkpoint
- **Test CSV File**: CSV file with test sequences

### 2. Computation Parameters

Configure the following parameters:

- **Number of Iterations**: Training iterations (default: 500)
- **Learning Rate**: Optimization learning rate (default: 1e-3)
- **Sequence Index**: Which sequence to process (default: 0)
- **Save Frequency**: Checkpoint save frequency (default: 25)
- **SAXS Extension**: File extension for SAXS data (default: \_atom_only.csv)
- **Random Initialization**: Enable/disable random initialization

### 3. Computation Execution

- Progress tracking with visual feedback
- Real-time status updates
- Error handling and validation
- Success/error notifications

## Usage

1. Navigate to `/metfish` in your application
2. Upload all three required files
3. Configure computation parameters as needed
4. Click "Run Computation" to start the process
5. Monitor progress and view results when complete

## Technical Details

### Component Structure

- **File**: `src/pages/metfish/_layout/index.tsx`
- **Component**: `MetfishDeploymentPage`
- **Framework**: React + Material-UI
- **Router**: TanStack Router

### State Management

The component uses React hooks for state management:

- `uploadedFiles`: Tracks uploaded file objects
- `params`: Stores computation parameters
- `isRunning`: Tracks computation status
- `progress`: Monitors computation progress
- `results`: Stores computation results
- `error`: Captures error messages

### Integration Points

The frontend is prepared for GCP backend integration. See `GCP_INTEGRATION.md` for details on:

- Setting up Cloud Storage
- Deploying Cloud Run/Functions
- Configuring API endpoints
- Security considerations

## Based on Metfish Repository

This implementation is based on the training script from:
https://github.com/lbl-cbg/metfish/tree/random_sample

The command structure mirrors the debugger configuration example:

```python
python src/metfish/refinement_model/train_structure.py \
  --data_dir /path/to/data \
  --output_dir /path/to/output \
  --ckpt_path /path/to/checkpoint.ckpt \
  --test_csv_name /path/to/test.csv \
  --saxs_ext _atom_only.csv \
  --num_iterations 500 \
  --learning_rate 1e-3 \
  --sequence_index 0 \
  --save_frequency 25 \
  --random_init
```

## Next Steps

1. **Backend Setup**: Follow `GCP_INTEGRATION.md` to set up your GCP backend
2. **API Configuration**: Update the API endpoint in the frontend code
3. **Authentication**: Implement user authentication if needed
4. **Testing**: Test end-to-end with actual data files
5. **Monitoring**: Set up logging and monitoring for production use

## Files

- `src/pages/metfish/_layout.tsx` - Layout wrapper component
- `src/pages/metfish/_layout/index.tsx` - Main deployment interface
- `src/pages/metfish/GCP_INTEGRATION.md` - Backend integration guide
- `src/pages/metfish/README.md` - This documentation file

## Material-UI Components Used

- Container, Paper, Box, Stack - Layout components
- Typography - Text display
- Button - File upload and action buttons
- TextField - Parameter inputs
- Grid - Responsive layout
- Card, CardContent - File upload cards
- Alert - Status messages
- LinearProgress, CircularProgress - Progress indicators
- FormControlLabel, Checkbox - Boolean parameter input
- Divider - Section separators
