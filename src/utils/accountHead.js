function getAccountHeadCandidates(account) {
  if (!account) return [];

  const id = String(account.uuid || account.name || "").trim();
  const encodedId = encodeURIComponent(id.replaceAll("-", ""));
  return [
    account.avatarUrl || null,
    encodedId ? `https://mc-heads.net/avatar/${encodedId}/64` : null,
    encodedId ? `https://minotar.net/helm/${encodedId}/64.png` : null,
    encodedId
      ? `https://crafatar.com/avatars/${encodedId}?size=64&overlay&default=MHF_Steve`
      : null,
  ].filter((url, index, urls) => url && urls.indexOf(url) === index);
}

export function getAccountHeadUrl(account) {
  return getAccountHeadCandidates(account)[0] || null;
}

export function handleAccountHeadError(event, account) {
  const image = event.currentTarget;
  const candidates = getAccountHeadCandidates(account);
  const currentIndex = Number(image.dataset.headSourceIndex || 0);
  const nextUrl = candidates[currentIndex + 1];

  if (nextUrl) {
    image.dataset.headSourceIndex = String(currentIndex + 1);
    image.src = nextUrl;
    return;
  }

  image.style.display = "none";
}
