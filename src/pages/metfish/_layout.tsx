import { Box } from '@mui/material';
import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/metfish/_layout')({
  component: MetfishLayout,
});

/**
 * Top-level wrapper for the metfish protein structure model deployment.
 * Inner pages are rendered inside the `<Outlet />` component
 */
function MetfishLayout() {
  return (
    <Box>
      <Outlet />
    </Box>
  );
}
