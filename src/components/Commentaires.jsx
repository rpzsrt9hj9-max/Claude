import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data.js';
import { urlPhoto } from '../db.js';
import { addCommentaire, deleteCommentaire } from '../actions.js';
import { Button, Icon, MicButton } from './ui.jsx';

export const dateHeure = (ms) =>
  new Date(ms).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Miniature d'une photo (copie locale ou téléchargée depuis Supabase Storage). */
export function Photo({ photo, className = 'size-20', onOpen }) {
  const [url, setUrl] = useState(null);
  const [absente, setAbsente] = useState(false);
  useEffect(() => {
    let vivant = true;
    urlPhoto(photo.chemin).then((u) => vivant && (u ? setUrl(u) : setAbsente(true))).catch(() => vivant && setAbsente(true));
    return () => {
      vivant = false;
    };
  }, [photo.chemin]);
  if (absente) return <span className={`${className} flex items-center justify-center rounded-xl bg-slate-200 p-1 text-center text-[10px] text-slate-500 dark:bg-slate-800`}>Photo hors ligne</span>;
  if (!url) return <span className={`${className} animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800`} />;
  return (
    <button type="button" onClick={() => onOpen?.(url)} className={`${className} shrink-0 overflow-hidden rounded-xl`}>
      <img src={url} alt={photo.legende || 'Photo'} className="size-full object-cover" />
    </button>
  );
}

/** Affichage plein écran d'une photo. */
export function Visionneuse({ url, onClose }) {
  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-2" onClick={onClose}>
      <img src={url} alt="" className="max-h-full max-w-full object-contain" />
      <button type="button" className="safe-top absolute top-2 right-2 flex size-12 items-center justify-center rounded-full bg-white/20 text-white" aria-label="Fermer">
        <Icon name="x" className="size-7" />
      </button>
    </div>
  );
}

export function CommentaireItem({ c, titre, onDelete }) {
  const [vue, setVue] = useState(null);
  return (
    <li className="rounded-2xl bg-white p-3 shadow-sm dark:bg-slate-900">
      <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
        <Icon name="chat" className="size-4" />
        <span className="flex-1">
          {dateHeure(c.created_at)}
          {c.auteur ? ` · ${c.auteur}` : ''}
          {titre ? ` · ${titre}` : ''}
        </span>
        {onDelete && (
          <button type="button" className="flex size-9 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100 dark:active:bg-slate-800" aria-label="Supprimer le commentaire" onClick={onDelete}>
            <Icon name="trash" className="size-4" />
          </button>
        )}
      </div>
      {c.texte && <p className="whitespace-pre-wrap break-words">{c.texte}</p>}
      {c.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {c.photos.map((p) => (
            <Photo key={p.id} photo={p} onOpen={setVue} />
          ))}
        </div>
      )}
      <Visionneuse url={vue} onClose={() => setVue(null)} />
    </li>
  );
}

/** Zone de saisie d'un commentaire horodaté, avec photos (appareil photo ou galerie). */
export function NouveauCommentaire({ tacheId = null, interventionId = null, placeholder = 'Ajouter un commentaire…' }) {
  const { data, user } = useData();
  const [texte, setTexte] = useState('');
  const [fichiers, setFichiers] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const input = useRef(null);
  const apercus = useMemo(() => fichiers.map((f) => URL.createObjectURL(f)), [fichiers]);
  useEffect(() => () => apercus.forEach((u) => URL.revokeObjectURL(u)), [apercus]);

  const valider = async () => {
    if (!texte.trim() && !fichiers.length) return;
    setEnvoi(true);
    try {
      await addCommentaire({ tacheId, interventionId, texte, fichiers, auteur: user?.email && user.email !== 'demo' ? user.email.split('@')[0] : null }, data);
      setTexte('');
      setFichiers([]);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="space-y-2 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-900">
      <div className="flex items-start gap-2">
        <textarea className="min-w-0 flex-1" rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={placeholder} aria-label="Commentaire" />
        <MicButton onResult={(t) => setTexte((v) => (v ? `${v} ${t}` : t.charAt(0).toUpperCase() + t.slice(1)))} />
      </div>
      {fichiers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {apercus.map((u, i) => (
            <span key={u} className="relative">
              <img src={u} alt="" className="size-16 rounded-xl object-cover" />
              <button
                type="button"
                aria-label="Retirer la photo"
                className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full bg-slate-800 text-white"
                onClick={() => setFichiers((fs) => fs.filter((_, j) => j !== i))}
              >
                <Icon name="x" className="size-4" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            setFichiers((fs) => [...fs, ...e.target.files]);
            e.target.value = '';
          }}
        />
        <Button icon="camera" onClick={() => input.current.click()}>
          Photo
        </Button>
        <Button variant="primary" icon="plus" className="flex-1" disabled={envoi || (!texte.trim() && !fichiers.length)} onClick={valider}>
          {envoi ? 'Ajout…' : 'Ajouter'}
        </Button>
      </div>
    </div>
  );
}

/** Fil de commentaires (le plus récent en haut). */
export function ListeCommentaires({ commentaires, titreDe }) {
  if (!commentaires.length) return null;
  return (
    <ul className="space-y-2">
      {commentaires.map((c) => (
        <CommentaireItem key={c.id} c={c} titre={titreDe?.(c)} onDelete={() => confirm('Supprimer ce commentaire ?') && deleteCommentaire(c)} />
      ))}
    </ul>
  );
}
