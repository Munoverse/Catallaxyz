'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Upload, UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onUpload: (file: File) => Promise<void>;
  disabled?: boolean;
  username?: string;
}

export default function AvatarUpload({
  currentAvatarUrl,
  onUpload,
  disabled = false,
  username = 'User',
}: AvatarUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    return () => {
      if (previewImage) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  function generatePreviewUrl(file: File): string {
    return URL.createObjectURL(file);
  }

  function clearPreview() {
    if (previewImage) {
      URL.revokeObjectURL(previewImage);
      setPreviewImage(null);
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    
    if (!file) {
      clearPreview();
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File too big! Max 5MB.');
      e.target.value = '';
      clearPreview();
      return;
    }

    // Validate file type
    if (!file.type.match(/^image\/(png|jpeg|jpg|webp)$/)) {
      toast.error('Invalid file type. Only PNG, JPG, and WEBP are allowed.');
      e.target.value = '';
      clearPreview();
      return;
    }

    // Generate preview
    clearPreview();
    const previewUrl = generatePreviewUrl(file);
    setPreviewImage(previewUrl);

    // Upload file
    try {
      setIsUploading(true);
      await onUpload(file);
      toast.success('Avatar uploaded successfully!');
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      toast.error(error.message || 'Failed to upload avatar');
      clearPreview();
      e.target.value = '';
    } finally {
      setIsUploading(false);
    }
  }

  const displayImage = previewImage || currentAvatarUrl;

  return (
    <div className="rounded-lg border border-border p-6">
      <h3 className="mb-4 text-lg font-semibold">Profile Picture</h3>
      <div className="flex items-center gap-6">
        {/* Avatar Display */}
        <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/60 ring-4 ring-primary/10">
          {displayImage ? (
            <Image
              src={displayImage}
              alt={`${username} avatar`}
              width={80}
              height={80}
              className="size-full object-cover"
            />
          ) : (
            <span className="text-2xl font-semibold text-white uppercase">
              {username.slice(0, 2)}
            </span>
          )}
        </div>

        {/* Upload Controls */}
        <div className="flex flex-1 flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUploadClick}
            disabled={disabled || isUploading}
            className="w-fit"
          >
            <Upload className="mr-2 size-4" />
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Max 5MB, JPG/PNG/WEBP only
          </p>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          disabled={disabled || isUploading}
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
