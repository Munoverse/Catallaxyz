'use client'

import { useState, useEffect } from 'react'
import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { useWalletUser } from '@/hooks/useWalletUser'
import { useTranslation } from 'react-i18next'
import { UserIcon, SaveIcon, CheckIcon, XIcon, LoaderIcon, Twitter, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { apiFetch } from '@/lib/api-client'

interface UsernameCheckResult {
  available: boolean
  reason?: string
}

export default function SettingsProfileForm() {
  const { t } = useTranslation()
  const { publicKey } = usePhantomWallet()
  const { user, updateUser, refetchUser } = useWalletUser()
  const [isSaving, setIsSaving] = useState(false)

  // Form state
  const [username, setUsername] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [isEditingUsername, setIsEditingUsername] = useState(false)
  const [bio, setBio] = useState('')
  const [twitterHandle, setTwitterHandle] = useState('')
  const [emailAddress, setEmailAddress] = useState('')

  // Username validation state
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheckResult | null>(null)
  const [isCheckingUsername, setIsCheckingUsername] = useState(false)
  const debouncedUsername = useDebounce(username, 500)

  // Load user data from hook
  useEffect(() => {
    if (user) {
      setUsername(user.username || '')
      setOriginalUsername(user.username || '')
      setBio(user.bio || '')
      setTwitterHandle(user.twitterHandle || '')
      setEmailAddress(user.emailAddress || '')
    }
  }, [user])

  // Check username availability when debounced username changes
  useEffect(() => {
    if (debouncedUsername && debouncedUsername.length >= 3) {
      checkUsernameAvailability(debouncedUsername)
    } else if (debouncedUsername && debouncedUsername.length > 0) {
      setUsernameCheck({ available: false, reason: 'Username must be at least 3 characters' })
    } else {
      setUsernameCheck(null)
    }
  }, [debouncedUsername])

  const checkUsernameAvailability = async (usernameToCheck: string) => {
    if (!usernameToCheck || usernameToCheck.length < 3) {
      setUsernameCheck(null)
      return
    }

    try {
      setIsCheckingUsername(true)

      // If username hasn't changed, mark as available
      if (originalUsername && originalUsername === usernameToCheck) {
        setUsernameCheck({ available: true })
        setIsCheckingUsername(false)
        return
      }

      // Check if username is available
      const checkResponse = await apiFetch(`/api/users/check-username?username=${encodeURIComponent(usernameToCheck)}`)
      const checkResult = await checkResponse.json()

      if (checkResult.success) {
        setUsernameCheck(checkResult.data)
      } else {
        setUsernameCheck({ available: false, reason: checkResult.error?.message || 'Error checking username' })
      }
    } catch (error) {
      console.error('Error checking username:', error)
      setUsernameCheck({ available: false, reason: 'Error checking username availability' })
    } finally {
      setIsCheckingUsername(false)
    }
  }

  const handleStartEditUsername = () => {
    setIsEditingUsername(true)
    setUsernameCheck(null)
  }

  const handleCancelEditUsername = () => {
    setUsername(originalUsername)
    setIsEditingUsername(false)
    setUsernameCheck(null)
  }

  const handleSave = async () => {
    if (!user) {
      toast.error('Please log in first')
      return
    }

    // Username is required
    if (!username || username.trim().length === 0) {
      toast.error(t('settings.profile.usernameRequired') || 'Username is required')
      return
    }

    // Validate username
    if (username.length < 3 || username.length > 30) {
      toast.error('Username must be between 3 and 30 characters')
      return
    }

    if (usernameCheck && !usernameCheck.available) {
      toast.error(usernameCheck.reason || 'Username is not available')
      return
    }

    // Validate Twitter handle if provided
    if (twitterHandle && !twitterHandle.match(/^@?[A-Za-z0-9_]{1,15}$/)) {
      toast.error('Invalid Twitter handle format')
      return
    }

    // Validate email if provided
    if (emailAddress && !emailAddress.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      toast.error('Invalid email address format')
      return
    }

    try {
      setIsSaving(true)

      await updateUser({
        username: username.trim(),
        bio: bio.trim() || undefined,
        twitterHandle: twitterHandle.trim().replace(/^@/, '') || undefined,
        emailAddress: emailAddress.trim() || undefined,
      })

      toast.success(t('settings.profile.saveSuccess') || 'Profile saved successfully')
      setOriginalUsername(username)
      setIsEditingUsername(false)
      await refetchUser()
    } catch (error: any) {
      console.error('Error saving profile:', error)
      toast.error(error.message || t('settings.profile.saveError') || 'Failed to save profile')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-8">
      {/* Profile Avatar */}
      <div className="rounded-lg border border-border p-6">
        <h3 className="mb-4 text-lg font-semibold">{t('settings.profile.profilePicture')}</h3>
        <div className="flex items-center gap-6">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-4 ring-primary/10">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Profile"
                className="size-full object-cover"
              />
            ) : (
              <UserIcon className="size-10 text-primary/50" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">
              {t('settings.profile.avatarNote') || 'Your profile picture will be generated from your wallet address or you can upload one later.'}
            </p>
          </div>
        </div>
      </div>

      {/* Wallet Address Section */}
      <div className="rounded-lg border border-border p-6">
        <h3 className="mb-4 text-lg font-semibold">Wallet Address</h3>
        <div className="grid gap-2">
          <Label className="text-sm font-medium">Solana Wallet</Label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={publicKey?.toString() || ''}
              readOnly
              className="flex-1 bg-muted font-mono text-sm cursor-text"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (publicKey) {
                  navigator.clipboard.writeText(publicKey.toString())
                  toast.success('Address copied to clipboard')
                }
              }}
            >
              Copy
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Your connected Solana wallet address used for trading.
          </p>
        </div>
      </div>

      {/* Profile Form */}
      <div className="grid gap-6">
        {/* Username */}
        <div className="grid gap-2">
          <Label htmlFor="username">
            {t('settings.profile.username')}
            <span className="ml-1 text-red-500">*</span>
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setUsernameCheck(null)
                }}
                placeholder={t('settings.profile.usernamePlaceholder')}
                maxLength={30}
                required
                disabled={!isEditingUsername}
                className={`${!isEditingUsername ? 'bg-muted cursor-not-allowed' : ''} ${
                  isEditingUsername && username && username.length > 0 ? (
                    usernameCheck?.available ? 'border-green-500 focus:border-green-500' :
                    usernameCheck?.available === false ? 'border-red-500 focus:border-red-500' :
                    ''
                  ) : ''
                }`}
              />
              {isEditingUsername && isCheckingUsername && (
                <LoaderIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {isEditingUsername && !isCheckingUsername && username && username.length >= 3 && usernameCheck && (
                usernameCheck.available ? (
                  <CheckIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-green-500" />
                ) : (
                  <XIcon className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-red-500" />
                )
              )}
            </div>
            {!isEditingUsername && originalUsername && (
              <Button
                type="button"
                variant="default"
                size="default"
                onClick={handleStartEditUsername}
                className="shrink-0"
              >
                {t('settings.profile.changeUsername')}
              </Button>
            )}
          </div>
          {isEditingUsername && username && username.length > 0 && usernameCheck && (
            <p className={`text-xs ${
              usernameCheck.available ? 'text-green-600 dark:text-green-400' :
              'text-red-600 dark:text-red-400'
            }`}>
              {usernameCheck.available ? '✓ Username available' : usernameCheck.reason || 'Username not available'}
            </p>
          )}
          {isEditingUsername && (!username || username.length === 0) && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {t('settings.profile.usernameRequired') || 'Username is required. Choose a unique username (3-30 characters)'}
            </p>
          )}
          {!isEditingUsername && originalUsername && (
            <p className="text-xs text-muted-foreground">
              {t('settings.profile.usernameLocked')}
            </p>
          )}
          {isEditingUsername && originalUsername && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancelEditUsername}
              className="w-fit"
            >
              {t('settings.profile.cancelEdit')}
            </Button>
          )}
        </div>

        {/* Bio */}
        <div className="grid gap-2">
          <Label htmlFor="bio">{t('settings.profile.bio')}</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder={t('settings.profile.bioPlaceholder')}
            rows={4}
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground">
            {bio.length}/200 {t('settings.profile.characters')}
          </p>
        </div>

        {/* Twitter Handle */}
        <div className="grid gap-2">
          <Label htmlFor="twitterHandle">
            <Twitter className="mr-2 inline-block size-4" />
            Twitter Handle
          </Label>
          <Input
            id="twitterHandle"
            type="text"
            value={twitterHandle}
            onChange={(e) => setTwitterHandle(e.target.value)}
            placeholder="@your_handle or your_handle"
            maxLength={16}
          />
          <p className="text-xs text-muted-foreground">
            Your Twitter/X username (optional)
          </p>
        </div>

        {/* Email Address */}
        <div className="grid gap-2">
          <Label htmlFor="emailAddress">
            <Mail className="mr-2 inline-block size-4" />
            Email Address
          </Label>
          <Input
            id="emailAddress"
            type="email"
            value={emailAddress}
            onChange={(e) => setEmailAddress(e.target.value)}
            placeholder="your.email@example.com"
          />
          <p className="text-xs text-muted-foreground">
            Your email address for notifications (optional)
          </p>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !user}
            className="min-w-32"
          >
            {isSaving ? (
              <>{t('settings.profile.saving')}</>
            ) : (
              <>{t('settings.profile.save')}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

