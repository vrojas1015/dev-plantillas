import type { Auth } from 'firebase/auth';

import { environment } from '@/environments/environment';

/**
 * Firebase se usa SOLO para autenticar al usuario y obtener su ID token; la
 * sesión de la app es el JWT propio del backend (ver AuthService).
 *
 * El SDK se importa dinámicamente: no entra en el bundle inicial y sólo se
 * descarga cuando alguien inicia o cierra sesión.
 */
let authPromise: Promise<Auth> | null = null;

function getFirebaseAuth(): Promise<Auth> {
  authPromise ??= (async () => {
    const { getApps, initializeApp } = await import('firebase/app');
    const { getAuth } = await import('firebase/auth');
    const app = getApps()[0] ?? initializeApp(environment.firebase);
    return getAuth(app);
  })();
  return authPromise;
}

/** Login con email y contraseña en Firebase. Devuelve el ID token. */
export async function signInWithFirebase(email: string, password: string): Promise<string> {
  const auth = await getFirebaseAuth();
  const { signInWithEmailAndPassword } = await import('firebase/auth');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.getIdToken();
}

export async function signOutFirebase(): Promise<void> {
  const auth = await getFirebaseAuth();
  const { signOut } = await import('firebase/auth');
  await signOut(auth);
}
