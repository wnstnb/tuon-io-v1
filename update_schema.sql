"-- Drop the existing foreign key constraint" 
"ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_user_id_fkey;" 
"-- Add a new foreign key constraint pointing to the built-in auth.users table" 
"ALTER TABLE artifacts ADD CONSTRAINT artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;" 
