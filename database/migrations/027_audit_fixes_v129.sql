-- AUDIT FIX v1.2.9 [B-17]: Add atomic increment functions for concurrent safety
-- Migration 027: Atomic counter operations

-- Function to atomically increment comment likes
CREATE OR REPLACE FUNCTION increment_comment_likes(comment_id UUID)
RETURNS TABLE(id UUID, likes_count INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.comments
  SET likes_count = COALESCE(comments.likes_count, 0) + 1
  WHERE comments.id = comment_id
  RETURNING comments.id, comments.likes_count;
END;
$$ LANGUAGE plpgsql;

-- Function to atomically decrement comment likes
CREATE OR REPLACE FUNCTION decrement_comment_likes(comment_id UUID)
RETURNS TABLE(id UUID, likes_count INTEGER) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.comments
  SET likes_count = GREATEST(COALESCE(comments.likes_count, 0) - 1, 0)
  WHERE comments.id = comment_id
  RETURNING comments.id, comments.likes_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION increment_comment_likes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION increment_comment_likes(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_comment_likes(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_comment_likes(UUID) TO service_role;
