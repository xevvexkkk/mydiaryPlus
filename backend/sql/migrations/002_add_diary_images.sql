-- Add images column to tb_diaries for existing installs that lack it
ALTER TABLE tb_diaries ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
