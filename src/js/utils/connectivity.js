/**
 * Combine la connectivité applicative observée avec le signal du navigateur.
 * Les réponses API priment sur navigator.onLine, qui n'est qu'un indice.
 */
export function isNetworkReachable(networkStatus, navigatorOnline) {
  if (networkStatus === 'online') return true;
  if (networkStatus === 'offline') return false;
  return navigatorOnline !== false;
}
