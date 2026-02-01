'use client';

import { useState, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { Comment } from '@/types';
import CommentEditor from './CommentEditor';
import { UserProfileLink } from '@/components/UserProfileLink';
import TipButton from '@/components/TipButton';
import { formatTipAmount, TIP_TOKEN_SYMBOL } from '@/lib/tips';

// DOMPurify configuration for safe HTML rendering
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
};

interface CommentItemProps {
  comment: Comment;
  allComments: Comment[];
  onReply: () => void;
  sortBy: 'tip' | 'time';
}

export default function CommentItem({ comment, allComments, onReply, sortBy }: CommentItemProps) {
  const [showReply, setShowReply] = useState(false);
  
  // AUDIT FIX v1.2.9 [F-26]: Use useMemo to cache replies calculation
  const replies = useMemo(() => 
    allComments
      .filter((c) => c.parent_id === comment.id)
      .sort((a, b) => {
        if (sortBy === 'tip') {
          const tipDiff = Number(b.tip_amount || 0) - Number(a.tip_amount || 0);
          if (tipDiff !== 0) return tipDiff;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }),
    [allComments, comment.id, sortBy]
  );
  
  const userWallet = comment.user?.wallet_address;
  const username = comment.user?.username;
  
  // AUDIT FIX v1.2.9 [F-26]: Use useMemo to cache displayName calculation
  const displayName = useMemo(() => 
    username
      ? (username.startsWith('@') ? username : `@${username}`)
      : userWallet
        ? `User ${userWallet.slice(0, 8)}`
        : 'Unknown',
    [username, userWallet]
  );

  return (
    <div className="border-l-2 border-gray-200 pl-4 space-y-2">
      <div className="bg-gray-50 p-3 rounded-lg">
        <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
          <div className="flex flex-col">
            <UserProfileLink 
              walletAddress={userWallet}
              username={username || undefined}
              className="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors"
            >
              {displayName}
            </UserProfileLink>
            <span className="text-[11px] text-gray-500">
              {new Date(comment.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="text-right text-[11px] text-gray-500">
            Tip {formatTipAmount(comment.tip_amount)} {TIP_TOKEN_SYMBOL}
          </div>
        </div>
        <div
          className="text-gray-700 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              typeof comment.content === 'string'
                ? comment.content
                : JSON.stringify(comment.content),
              PURIFY_CONFIG
            ),
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowReply(!showReply)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showReply ? 'Cancel' : 'Reply'}
          </button>
          {userWallet && (
            <TipButton
              targetId={comment.id}
              targetType="comment"
              recipientWallet={userWallet}
              compact
              label="Tip comment"
              onSuccess={onReply}
            />
          )}
        </div>
      </div>

      {showReply && (
        <div className="ml-4">
          <CommentEditor
            marketId={comment.market_id}
            parentId={comment.id}
            onCommentAdded={onReply}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}

      {replies.length > 0 && (
        <div className="ml-4 space-y-2">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              allComments={allComments}
              onReply={onReply}
              sortBy={sortBy}
            />
          ))}
        </div>
      )}
    </div>
  );
}
