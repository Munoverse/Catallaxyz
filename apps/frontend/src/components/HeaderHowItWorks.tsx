'use client'

import { usePhantomWallet } from '@/hooks/usePhantomWallet'
import { InfoIcon, XIcon } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useClientMounted } from '@/hooks/useClientMounted'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { AuthDialog } from '@/components/AuthDialog'

const STEPS = [
  {
    title: '1. Choose a Market',
    description:
      'Buy \'Yes\' or \'No\' shares based on what you honestly think will happen. Prices move in real time as other traders trade.',
    image: '/images/how-it-works/1.webp',
    imageAlt: 'Illustration showing how to pick a market',
    ctaLabel: 'Next',
  },
  {
    title: '2. Make Your Trade',
    description:
      'Add funds with crypto—then choose your position. Trade on real-world predictions with full transparency.',
    image: '/images/how-it-works/2.webp',
    imageAlt: 'Illustration showing how to place a bet',
    ctaLabel: 'Next',
  },
  {
    title: '3. Cash Out 🤑',
    description:
      'Sell your \'Yes\' or \'No\' shares anytime, or wait until the market settles. Winning shares redeem for $1 each. Start trading in minutes.',
    image: '/images/how-it-works/3.png',
    imageAlt: 'Illustration showing how profits work',
    ctaLabel: 'Get Started',
  },
] as const

export default function HeaderHowItWorks() {
  const isMounted = useClientMounted()
  const { isConnected } = usePhantomWallet()
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [isMobileBannerDismissed, setIsMobileBannerDismissed] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  const currentStep = STEPS[activeStep]
  const isLastStep = activeStep === STEPS.length - 1

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const dismissed = window.localStorage.getItem('how_it_works_banner_dismissed')
    if (dismissed === 'true') {
      queueMicrotask(() => setIsMobileBannerDismissed(true))
    }
  }, [])

  function handleDismissBanner() {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('how_it_works_banner_dismissed', 'true')
    }
    setIsMobileBannerDismissed(true)
  }

  function handleOpenChange(nextOpen: boolean) {
    setIsOpen(nextOpen)
    setActiveStep(0)
  }

  function handleNext() {
    if (isLastStep) {
      setIsOpen(false)
      setActiveStep(0)
      setShowAuthDialog(true)
      return
    }

    setActiveStep(step => Math.min(step + 1, STEPS.length - 1))
  }

  if (!isMounted || isConnected) {
    return <></>
  }

  const showMobileBanner = !isMobileBannerDismissed

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="hidden items-center gap-1.5 sm:inline-flex"
            data-testid="how-it-works-trigger-desktop"
          >
            <InfoIcon className="size-4" />
            {t('header.howItWorks')}
          </Button>
        </DialogTrigger>

      {showMobileBanner && (
        <div className="fixed right-0 bottom-0 left-0 z-40 border-t bg-background sm:hidden" data-testid="how-it-works-mobile-banner">
          <div className="container flex items-center justify-between gap-2 py-3">
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="flex-1 justify-center gap-2 text-primary no-underline"
                data-testid="how-it-works-trigger-mobile"
              >
                <InfoIcon className="size-4" />
                {t('header.howItWorks')}
              </Button>
            </DialogTrigger>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={handleDismissBanner}
              data-testid="how-it-works-dismiss-banner"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      )}

        <DialogContent className="max-h-[95vh] gap-0 overflow-y-auto p-0 sm:max-w-md" data-testid="how-it-works-dialog">
          <div className="h-[340px] overflow-hidden rounded-t-lg">
            <Image
              src={currentStep.image}
              alt={currentStep.imageAlt}
              width={448}
              height={252}
              className="size-full object-cover"
            />
          </div>

          <div className="flex flex-col gap-6 p-6">
            <div className="flex items-center justify-center gap-2">
              {STEPS.map((step, index) => (
                <span
                  key={step.title}
                  className={cn(
                    'h-1.5 w-8 rounded-full bg-muted transition-colors',
                    index === activeStep && 'bg-primary',
                  )}
                />
              ))}
            </div>

            <DialogHeader className="gap-2">
              <DialogTitle className="text-xl font-semibold">
                {currentStep.title}
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {currentStep.description}
              </DialogDescription>
            </DialogHeader>

            <Button size="lg" className="h-11 w-full" onClick={handleNext} data-testid="how-it-works-next-button">
              {currentStep.ctaLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AuthDialog open={showAuthDialog} onClose={() => setShowAuthDialog(false)} />
    </>
  )
}

