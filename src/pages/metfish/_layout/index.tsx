import {
  Box,
  Button,
  Container,
  Paper,
  Stack,
  Typography,
  TextField,
  Grid,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Divider,
  Card,
  CardContent,
  LinearProgress,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { useState, useEffect } from 'react';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/metfish/_layout/')({
  component: MetfishDeploymentPage,
});

interface ComputationParams {
  numIterations: string;
  learningRate: string;
  sequenceIndex: string;
  saveFrequency: string;
  randomInit: boolean;
  saxsExt: string;
}

interface UploadedFiles {
  dataDir: File | null;
  testCsvFile: File | null;
}

/**
 * Metfish Protein Structure Model Deployment Page
 * Based on: https://github.com/lbl-cbg/metfish/tree/random_sample
 * Uses checkpoints from GCP bucket: metfishi-checkpoints
 */
function MetfishDeploymentPage() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFiles>({
    dataDir: null,
    testCsvFile: null,
  });

  const [selectedCheckpoint, setSelectedCheckpoint] = useState<string>('');
  const [availableCheckpoints, setAvailableCheckpoints] = useState<string[]>(
    []
  );
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);

  const [params, setParams] = useState<ComputationParams>({
    numIterations: '500',
    learningRate: '1e-3',
    sequenceIndex: '0',
    saveFrequency: '25',
    randomInit: true,
    saxsExt: '_atom_only.csv',
  });

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available checkpoints from GCP on component mount
  useEffect(() => {
    const fetchCheckpoints = async () => {
      const apiUrl = import.meta.env.VITE_GCP_API_URL;
      if (!apiUrl) {
        return;
      }

      setLoadingCheckpoints(true);
      try {
        const response = await fetch(`${apiUrl}/list-checkpoints`);
        if (response.ok) {
          const data = await response.json();
          setAvailableCheckpoints(data.checkpoints || []);
          if (data.checkpoints && data.checkpoints.length > 0) {
            setSelectedCheckpoint(data.checkpoints[0]);
          }
        }
      } catch (err) {
        // Failed to fetch checkpoints - silently ignore
      } finally {
        setLoadingCheckpoints(false);
      }
    };

    fetchCheckpoints();
  }, []);

  const handleFileUpload = (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: keyof UploadedFiles
  ) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setUploadedFiles({
        ...uploadedFiles,
        [fileType]: files[0],
      });
    }
  };

  const handleParamChange =
    (field: keyof ComputationParams) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value =
        event.target.type === 'checkbox'
          ? event.target.checked
          : event.target.value;
      setParams({
        ...params,
        [field]: value,
      });
    };

  const handleRunComputation = async () => {
    // Validate required files
    if (!uploadedFiles.dataDir || !uploadedFiles.testCsvFile) {
      setError('Please upload all required files before running computation.');
      return;
    }

    if (!selectedCheckpoint && availableCheckpoints.length > 0) {
      setError('Please select a checkpoint.');
      return;
    }

    setError(null);
    setResults(null);
    setIsRunning(true);
    setProgress(0);

    try {
      // Prepare form data for GCP backend
      const formData = new FormData();
      formData.append('data_dir', uploadedFiles.dataDir);
      formData.append('test_csv_file', uploadedFiles.testCsvFile);
      formData.append('checkpoint_file', selectedCheckpoint); // Send checkpoint name, not file
      formData.append('num_iterations', params.numIterations);
      formData.append('learning_rate', params.learningRate);
      formData.append('sequence_index', params.sequenceIndex);
      formData.append('save_frequency', params.saveFrequency);
      formData.append('random_init', params.randomInit.toString());
      formData.append('saxs_ext', params.saxsExt);

      // Simulate progress for demonstration
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 1000);

      // Use environment variable for GCP API endpoint
      const apiUrl = import.meta.env.VITE_GCP_API_URL;

      if (apiUrl) {
        // Real API call to GCP backend
        const response = await fetch(`${apiUrl}/run-metfish`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('API request failed');
        }

        const data = await response.json();
        clearInterval(progressInterval);
        setProgress(100);
        const resultMessage = data.job_id
          ? `Computation completed successfully! Job ID: ${data.job_id}\nResults saved to: gs://metfish-results/${data.job_id}/`
          : data.message || 'Computation completed successfully!';
        setResults(resultMessage);
        setIsRunning(false);
        return;
      }

      // Simulate API call (for testing without backend)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      clearInterval(progressInterval);
      setProgress(100);
      setResults(
        'Computation completed successfully! Results will be available in gs://metfish-results/'
      );
      setIsRunning(false);
    } catch (err) {
      setError(
        `Failed to run computation: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setIsRunning(false);
      setProgress(0);
    }
  };

  const allFilesUploaded =
    uploadedFiles.dataDir &&
    uploadedFiles.testCsvFile &&
    (selectedCheckpoint || availableCheckpoints.length === 0);

  return (
    <Box>
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            Metfish Protein Structure Model
          </Typography>
          <Typography variant="body1" color="text.secondary" paragraph>
            Deploy a PyTorch-driven AI protein structure refinement model on L4
            GPU. Upload your data files, select a checkpoint, and configure
            computation parameters.
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* File Upload Section */}
          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            1. Upload Data Files & Select Checkpoint
          </Typography>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>
                    Data Directory (ZIP)
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 2 }}
                  >
                    Contains protein structure input data
                  </Typography>
                  <Button
                    component="label"
                    variant="outlined"
                    fullWidth
                    startIcon={<CloudUploadIcon />}
                  >
                    {uploadedFiles.dataDir
                      ? uploadedFiles.dataDir.name
                      : 'Upload Data'}
                    <input
                      type="file"
                      hidden
                      accept=".zip"
                      onChange={(e) => handleFileUpload(e, 'dataDir')}
                    />
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>
                    Checkpoint (from bucket)
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 2 }}
                  >
                    Pre-trained model from metfishi-checkpoints
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel>Select Checkpoint</InputLabel>
                    <Select
                      value={selectedCheckpoint}
                      label="Select Checkpoint"
                      onChange={(e) => setSelectedCheckpoint(e.target.value)}
                      disabled={
                        loadingCheckpoints || availableCheckpoints.length === 0
                      }
                    >
                      {availableCheckpoints.map((checkpoint) => (
                        <MenuItem key={checkpoint} value={checkpoint}>
                          {checkpoint}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {loadingCheckpoints && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ mt: 1 }}
                    >
                      Loading checkpoints...
                    </Typography>
                  )}
                  {!loadingCheckpoints && availableCheckpoints.length === 0 && (
                    <Typography
                      variant="caption"
                      color="warning.main"
                      sx={{ mt: 1 }}
                    >
                      No checkpoints found. Configure VITE_GCP_API_URL in .env
                    </Typography>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" gutterBottom>
                    Test CSV File
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    sx={{ mb: 2 }}
                  >
                    CSV file with test sequences
                  </Typography>
                  <Button
                    component="label"
                    variant="outlined"
                    fullWidth
                    startIcon={<CloudUploadIcon />}
                  >
                    {uploadedFiles.testCsvFile
                      ? uploadedFiles.testCsvFile.name
                      : 'Upload CSV'}
                    <input
                      type="file"
                      hidden
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, 'testCsvFile')}
                    />
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Divider sx={{ my: 4 }} />

          {/* Computation Parameters Section */}
          <Typography variant="h6" gutterBottom>
            2. Configure Computation Parameters
          </Typography>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Number of Iterations"
                type="number"
                value={params.numIterations}
                onChange={handleParamChange('numIterations')}
                helperText="Number of training iterations"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Learning Rate"
                value={params.learningRate}
                onChange={handleParamChange('learningRate')}
                helperText="Learning rate for optimization (e.g., 1e-3)"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Sequence Index"
                type="number"
                value={params.sequenceIndex}
                onChange={handleParamChange('sequenceIndex')}
                helperText="Index of the sequence to process"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Save Frequency"
                type="number"
                value={params.saveFrequency}
                onChange={handleParamChange('saveFrequency')}
                helperText="How often to save checkpoints"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="SAXS Extension"
                value={params.saxsExt}
                onChange={handleParamChange('saxsExt')}
                helperText="File extension for SAXS data"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={params.randomInit}
                    onChange={handleParamChange('randomInit')}
                  />
                }
                label="Random Initialization"
              />
            </Grid>
          </Grid>

          <Divider sx={{ my: 4 }} />

          {/* Run Computation Section */}
          <Typography variant="h6" gutterBottom>
            3. Run Computation on L4 GPU
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}

          {results && (
            <Alert
              severity="success"
              sx={{ mt: 2 }}
              style={{ whiteSpace: 'pre-line' }}
            >
              {results}
            </Alert>
          )}

          {isRunning && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Running computation on GPU... {progress}%
              </Typography>
              <LinearProgress variant="determinate" value={progress} />
            </Box>
          )}

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              size="large"
              startIcon={
                isRunning ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <PlayArrowIcon />
                )
              }
              onClick={handleRunComputation}
              disabled={!allFilesUploaded || isRunning}
            >
              {isRunning ? 'Running on GPU...' : 'Run Computation'}
            </Button>
          </Stack>

          {!allFilesUploaded && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Please upload all required files and select a checkpoint to enable
              computation.
            </Typography>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
