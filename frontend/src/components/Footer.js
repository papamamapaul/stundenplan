export function createFooter() {
  const footer = document.createElement('footer');
  footer.className = 'footer footer-center bg-base-300 text-base-content p-4 mt-10';

  const row = document.createElement('div');
  row.className = 'flex flex-col gap-2 md:flex-row md:items-center md:justify-between w-full';

  const links = document.createElement('div');
  links.className = 'flex flex-wrap justify-center md:justify-start gap-4 text-sm';

  const support = document.createElement('a');
  support.href = '#/support';
  support.className = 'link link-hover';
  support.textContent = 'Support';

  const privacy = document.createElement('a');
  privacy.href = '#/datenschutz';
  privacy.className = 'link link-hover';
  privacy.textContent = 'Datenschutz';

  const prefs = document.createElement('a');
  prefs.href = '#/privacy-settings';
  prefs.className = 'link link-hover';
  prefs.textContent = 'Privacy Settings';

  links.append(support, privacy, prefs);

  const copy = document.createElement('aside');
  copy.className = 'text-xs opacity-70';
  copy.innerHTML = `© ${new Date().getFullYear()} KlassenTakt. Alle Rechte vorbehalten.`;

  row.append(links, copy);
  footer.append(row);
  return footer;
}
