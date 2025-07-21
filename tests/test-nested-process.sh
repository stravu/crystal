#!/bin/bash
# Test script that creates nested processes

echo "Starting parent process (PID: $$)"

# Create a child process that creates its own children
(
  echo "Child process started (PID: $$)"
  
  # Create grandchild processes
  (
    echo "Grandchild 1 started (PID: $$)"
    sleep 300  # Sleep for 5 minutes
  ) &
  
  (
    echo "Grandchild 2 started (PID: $$)"
    sleep 300  # Sleep for 5 minutes
  ) &
  
  # Child process also sleeps
  sleep 300
) &

# Parent process sleeps
echo "Parent will sleep for 5 minutes..."
sleep 300