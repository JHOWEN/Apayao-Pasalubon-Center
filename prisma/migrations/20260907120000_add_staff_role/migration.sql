-- Add the staff role without resetting existing data.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STAFF';
