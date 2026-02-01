'use client';

import { useEffect, useState, useMemo } from 'react';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import { Comment } from '@/types';
import CommentEditor from './CommentEditor';
import CommentItem from './CommentItem';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { apiFetch } from '@/lib/api-client';

interface CommentsSectionProps {
  marketId: string;
}

export default function CommentsSection({ marketId }: CommentsSectionProps) {
  const { isConnected } = usePhantomWallet();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'tip' | 'time'>('tip');

  useEffect(() => {
    fetchComments();
  }, [marketId, sortBy]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ market_id: marketId, sort: sortBy });
      const response = await apiFetch(`/api/comments?${params.toString()}`);
      const data = await response.json();
      setComments(data.comments || []);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCommentAdded = () => {
    fetchComments();
  };

  if (loading) {
    return <p className="text-gray-500 text-center py-4">Loading comments...</p>;
  }

  // AUDIT FIX v1.2.9 [F-27]: Use useMemo to cache topLevelComments calculation
  const topLevelComments = useMemo(() => 
    comments
      .filter((c) => !c.parent_id)
      .sort((a, b) => {
        if (sortBy === 'tip') {
          const tipDiff = Number(b.tip_amount || 0) - Number(a.tip_amount || 0);
          if (tipDiff !== 0) return tipDiff;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [comments, sortBy]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Comment sorting</p>
        <ButtonGroup>
          <Button
            type="button"
            size="sm"
            variant={sortBy === 'tip' ? 'default' : 'outline'}
            onClick={() => setSortBy('tip')}
          >
            By tips
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sortBy === 'time' ? 'default' : 'outline'}
            onClick={() => setSortBy('time')}
          >
            By time
          </Button>
        </ButtonGroup>
      </div>
      {isConnected && (
        <CommentEditor marketId={marketId} onCommentAdded={handleCommentAdded} />
      )}

      <div className="space-y-4">
        {topLevelComments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            allComments={comments}
            onReply={handleCommentAdded}
            sortBy={sortBy}
          />
        ))}
      </div>

      {comments.length === 0 && (
        <p className="text-gray-500 text-center py-4">No comments yet. Be the first to comment!</p>
      )}
    </div>
  );
}
