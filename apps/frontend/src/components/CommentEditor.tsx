'use client';

import { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { usePhantomWallet } from '@/hooks/usePhantomWallet';
import toast from 'react-hot-toast';
import { apiFetch } from '@/lib/api-client';
import { buildWalletAuthHeaders } from '@/lib/wallet-auth';
import { AuthDialog } from '@/components/AuthDialog';

interface CommentEditorProps {
  marketId: string;
  parentId?: string;
  onCommentAdded: () => void;
  onCancel?: () => void;
}

export default function CommentEditor({
  marketId,
  parentId,
  onCommentAdded,
  onCancel,
}: CommentEditorProps) {
  const [loading, setLoading] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { isConnected, walletAddress, solana } = usePhantomWallet();

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Write your comment...</p>',
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[100px] p-4 border border-gray-300 rounded-lg',
      },
    },
  });

  const handleSubmit = async () => {
    if (!editor) return;
    if (!isConnected || !walletAddress || !solana) {
      setShowAuthDialog(true);
      return;
    }

    const content = editor.getJSON();
    const text = editor.getText().trim();

    if (!text) {
      toast.error('Please enter a comment');
      return;
    }

    setLoading(true);

    try {
      const signMessage = async (message: Uint8Array) => {
        const { signature } = await solana.signMessage(message);
        return signature;
      };
      const authHeaders = await buildWalletAuthHeaders({ walletAddress, signMessage });

      const response = await apiFetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          market_id: marketId,
          parent_id: parentId,
          content,
          walletAddress,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to post comment');
      }

      toast.success('Comment posted!');
      editor.commands.clearContent();
      onCommentAdded();
      if (onCancel) onCancel();
    } catch (error: any) {
      toast.error(error.message || 'Failed to post comment');
    } finally {
      setLoading(false);
    }
  };

  if (!editor) {
    return null;
  }

  return (
    <>
      <div className="space-y-2">
        <EditorContent editor={editor} />
        <div className="flex gap-2 justify-end">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
          >
            {loading ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </div>
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </>
  );
}
