"use client";

import { useState } from "react";
import { ArtistControls } from "@/components/home/seal/artist-controls";
import { BottomNav } from "@/components/home/layout/bottom-nav";
import { HeroPanel } from "@/components/home/hero/hero-panel";
import { PipelineSection } from "@/components/home/pipeline/pipeline-section";
import { RegisterConsole } from "@/components/home/console/register-console";
import { ReportSection } from "@/components/home/report/report-section";
import { SealCertificate } from "@/components/home/seal/seal-certificate";
import { SellRightsModal } from "@/components/home/seal/sell-rights-modal";
import { SiteHeader } from "@/components/home/layout/site-header";
import { SponsorMarquee } from "@/components/home/hero/sponsor-marquee";
import { WorldIdQrModal } from "@/components/home/console/world-id-qr-modal";
import { echoSounds } from "@/lib/sound-design";
import { useAudioPreview } from "@/lib/hooks/use-audio-preview";
import { useEchoFlow } from "@/lib/hooks/use-echo-flow";

export default function Home() {
  const echo = useEchoFlow();
  const { audioRef, isPlaying, togglePreview } = useAudioPreview(echo.audioFile);
  const [sfxEnabled, setSfxEnabled] = useState(() => !echoSounds.isMuted());
  const [sellModalOpen, setSellModalOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-[#050505] text-[#f8f6ee]">
      <audio ref={audioRef} className="hidden" preload="metadata" />

      <SiteHeader sfxEnabled={sfxEnabled} onToggleSfx={() => setSfxEnabled(echoSounds.toggle())} />

      <section id="top" className="relative px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className="noise-layer echo-noise-drift" aria-hidden="true" />
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-start">
          <HeroPanel isPlaying={isPlaying} />
          <RegisterConsole
            isConnected={echo.isConnected}
            historyEntries={echo.historyEntries}
            onRestoreFlow={(flowId) => void echo.restoreFlow(flowId)}
            audioFile={echo.audioFile}
            audioName={echo.audioName}
            trackFingerprint={echo.trackFingerprint}
            onAudioFile={echo.handleAudioFile}
            isPlaying={isPlaying}
            onTogglePreview={() => void togglePreview()}
            verification={echo.verification}
            canVerify={echo.canVerify}
            onVerifyWorld={() => void echo.handleVerifyWorld()}
            payment={echo.payment}
            canPay={echo.canPay}
            canStartAnalysis={echo.canStartAnalysis}
            isStartingPipeline={echo.isStartingPipeline}
            pipelineStarted={echo.pipelineStarted}
            flow={echo.flow}
            onPrimaryAction={() => void echo.handlePrimaryAction()}
            flowStatus={echo.flowStatus}
            displaySteps={echo.displaySteps}
            hasLiveSteps={echo.livePipelineSteps.length > 0}
          />
        </div>
        <SponsorMarquee />
      </section>

      <PipelineSection steps={echo.displaySteps} />

      <ReportSection
        verdict={echo.verdictInfo}
        report={echo.activeReport}
        matches={echo.reportMatches}
        publicReferences={echo.publicReferences}
        flowStatus={echo.flow?.status}
        flowError={echo.flow?.error}
        pipelineStarted={echo.pipelineStarted}
        blockedStepReason={echo.blockedStepReason}
      />

      <section id="seal" className="px-4 pb-32 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[1fr_0.82fr] lg:items-stretch">
          <SealCertificate
            flow={echo.flow}
            hasRegistrySeal={echo.hasRegistrySeal}
            report={echo.activeReport}
            publicReferences={echo.publicReferences}
            blockedStepReason={echo.blockedStepReason}
            trackId={echo.certificateTrackId}
            txHash={echo.certificateTxHash}
          />
          <ArtistControls
            flowStatus={echo.flow?.status}
            hasRegistrySeal={echo.hasRegistrySeal}
            isCleanAndSealed={echo.isCleanAndSealed}
            certificateTrackId={echo.certificateTrackId}
            isRevealing={echo.isWritingRegistry}
            onReveal={() => void echo.handleRevealTrack()}
            canPublishToSoundCloud={echo.canPublishToSoundCloud}
            soundCloudPublish={echo.soundCloudPublish}
            onPublishToSoundCloud={() => void echo.handlePublishToSoundCloud()}
            onOpenSellModal={() => setSellModalOpen(true)}
          />
        </div>
      </section>

      {sellModalOpen && echo.certificateTrackId && (
        <SellRightsModal trackId={echo.certificateTrackId} onClose={() => setSellModalOpen(false)} />
      )}

      {echo.worldQr && (
        <WorldIdQrModal
          connectorURI={echo.worldQr.connectorURI}
          imageDataUrl={echo.worldQr.imageDataUrl}
          onClose={echo.dismissWorldQr}
        />
      )}

      <BottomNav />
    </main>
  );
}
