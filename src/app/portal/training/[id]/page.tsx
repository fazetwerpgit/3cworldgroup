'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { ref, getDownloadURL } from 'firebase/storage';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Link2,
  Loader2,
} from 'lucide-react';
import { useTraining } from '@/hooks/useTraining';
import { useAuth } from '@/contexts/AuthContext';
import { storage } from '@/lib/firebase/config';
import { TRAINING_CATEGORIES, RESOURCE_TYPES } from '@/types';
import { LoadFailed } from '@/components/portal/rep/RepLearn';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import l from '@/components/portal/rep/rep-learn.module.css';

// The chrome (top bar, tab bar, auth gate with training:read) comes from ../layout.tsx: RepShell.
export default function TrainingDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const { currentResource, progress, error, fetchResource, fetchProgress, markComplete } = useTraining();
  const [marking, setMarking] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);

  const resourceId = params.id as string;
  const resourceProgress = progress[resourceId];

  useEffect(() => {
    if (resourceId) fetchResource(resourceId);
  }, [resourceId, fetchResource]);

  useEffect(() => {
    if (user) fetchProgress(user.uid);
  }, [user, fetchProgress]);

  useEffect(() => {
    const path = currentResource?.storagePath;
    if (!path || !storage) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFileUrl(null);
      return;
    }

    let active = true;
    getDownloadURL(ref(storage, path))
      .then((url) => {
        if (active) setFileUrl(url);
      })
      .catch(() => {
        if (active) setFileUrl(null);
      });

    return () => {
      active = false;
    };
  }, [currentResource?.storagePath]);

  const handleMarkComplete = async () => {
    if (!user || !resourceId) return;
    setMarking(true);
    setMarkFailed(false);
    const saved = await markComplete(user.uid, resourceId);
    setMarkFailed(!saved);
    setMarking(false);
  };

  const categoryConfig = TRAINING_CATEGORIES.find((category) => category.value === currentResource?.category);
  const typeConfig = RESOURCE_TYPES.find((type) => type.value === currentResource?.type);
  const completed = Boolean(resourceProgress?.completed);

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const thumbnail = currentResource?.thumbnailUrl ? (
    <div className={l.thumb}>
      <Image
        src={currentResource.thumbnailUrl}
        alt=""
        fill
        unoptimized
        sizes="(max-width: 1024px) 100vw, 800px"
        style={{ objectFit: 'cover' }}
      />
    </div>
  ) : null;

  return (
    <div className={p.page}>
      <Link href="/portal/training" className={p.back}>
        <ArrowLeft size={18} aria-hidden="true" />
        University
      </Link>

      {!currentResource && error ? (
        <section className={s.panel}>
          <LoadFailed what="this module" onRetry={() => void fetchResource(resourceId)} />
        </section>
      ) : null}

      {!currentResource && !error ? (
        <div className={l.lessonHead} aria-busy="true" aria-label="Loading module">
          <span className={`${s.skel} ${p.skelLineShort}`} />
          <span className={`${s.skel} ${l.skelTitle}`} />
          <span className={`${s.skel} ${l.skelMedia}`} />
        </div>
      ) : null}

      {currentResource && (
        <>
          <header className={l.lessonHead}>
            <div className={l.tags}>
              <span className={`${p.tag} ${p.tagBlue}`}>{typeConfig?.label || currentResource.type}</span>
              <span className={p.tag}>{categoryConfig?.label || currentResource.category}</span>
              {currentResource.isRequired && !completed && <span className={`${p.tag} ${p.tagAmber}`}>Required</span>}
              {completed && <span className={`${p.tag} ${p.tagLime}`}>Completed</span>}
            </div>
            <h1 className={l.lessonTitle}>{currentResource.title}</h1>
            {currentResource.duration && currentResource.duration > 0 ? (
              <p className={l.lessonMeta}>
                <Clock3 size={16} aria-hidden="true" />
                {formatDuration(currentResource.duration)}
              </p>
            ) : null}
          </header>

          <div className={`${l.layout} ${l.lesson}`}>
            <div className={l.col}>
              {currentResource.storagePath && (
                <div>
                  <div className={l.media}>
                    {!fileUrl ? (
                      <div className={l.mediaLoading}>Loading…</div>
                    ) : currentResource.type === 'video' ? (
                      <video controls playsInline preload="metadata" src={fileUrl} className={l.video} />
                    ) : currentResource.mimeType === 'application/pdf' ? (
                      <iframe src={fileUrl} title={currentResource.title} className={l.pdf} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileUrl} alt={currentResource.title} className={l.image} />
                    )}
                  </div>
                  {fileUrl && (
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer" className={l.openLink}>
                      Open in a new tab <ExternalLink size={14} aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}

              {currentResource.type === 'video' && currentResource.url && (
                <div className={l.media}>
                  <iframe
                    src={currentResource.url}
                    title={currentResource.title}
                    className={l.frame}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}

              {currentResource.type === 'document' && currentResource.url && (
                <section className={`${s.panel} ${l.docCard}`}>
                  {thumbnail}
                  <div className={l.docTop}>
                    <span className={p.tile}>
                      <FileText size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>View or download the document</strong>
                      <span>Opens in a new tab</span>
                    </div>
                  </div>
                  <a className={`${s.btnPrimary} ${s.btnBlock}`} href={currentResource.url} target="_blank" rel="noopener noreferrer">
                    <Download size={20} aria-hidden="true" />
                    Open document
                  </a>
                </section>
              )}

              {currentResource.type === 'link' && currentResource.url && (
                <section className={`${s.panel} ${l.docCard}`}>
                  {thumbnail}
                  <div className={l.docTop}>
                    <span className={p.tile}>
                      <Link2 size={20} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>This module lives on another site</strong>
                      <span>Opens in a new tab</span>
                    </div>
                  </div>
                  <a className={`${s.btnPrimary} ${s.btnBlock}`} href={currentResource.url} target="_blank" rel="noopener noreferrer">
                    Open link
                    <ExternalLink size={20} aria-hidden="true" />
                  </a>
                </section>
              )}

              {!currentResource.url && !currentResource.storagePath && (
                <section className={`${s.panel} ${l.docCard}`}>
                  {thumbnail}
                  <p className={p.hint}>Nothing to open on this module yet.</p>
                </section>
              )}
            </div>

            <div className={l.col}>
              {currentResource.description ? (
                <section className={`${s.panel} ${l.about}`} aria-labelledby="about-title">
                  <h2 id="about-title" className={s.kicker}>About this module</h2>
                  <p>{currentResource.description}</p>
                </section>
              ) : null}

              <section className={`${s.panel} ${l.complete}`} aria-live="polite">
                {completed ? (
                  <div className={l.completeDone}>
                    <CheckCircle2 size={28} aria-hidden="true" />
                    <div>
                      <h2 className={l.completeTitle}>Completed</h2>
                      <p className={p.hint}>You finished this module.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <h2 className={l.completeTitle}>Finished it?</h2>
                      <p className={p.hint}>Mark it complete once you&apos;ve gone through the material.</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleMarkComplete}
                      disabled={marking}
                      className={`${s.btnPrimary} ${s.btnBlock}`}
                    >
                      {marking ? <Loader2 size={20} className={l.spin} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
                      {marking ? 'Saving…' : 'Mark complete'}
                    </button>
                    {markFailed ? (
                      <p className={`${p.hint} ${p.hintError}`} role="alert">
                        Couldn&apos;t save that. Try again.
                      </p>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
