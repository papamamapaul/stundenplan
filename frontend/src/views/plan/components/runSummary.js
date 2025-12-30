export function createRunSummarySection() {
  const summaryAside = document.createElement('aside');
  summaryAside.className = 'xl:w-80 w-full bg-white border border-gray-200 rounded-xl flex flex-col shadow-sm';

  const summaryHeader = document.createElement('div');
  summaryHeader.className = 'p-4 border-b border-gray-200 space-y-3 bg-white';
  summaryAside.appendChild(summaryHeader);

  const summaryHeaderRow = document.createElement('div');
  summaryHeaderRow.className = 'flex items-center justify-between gap-3';
  summaryHeader.appendChild(summaryHeaderRow);

  const summaryHeaderInfo = document.createElement('div');
  summaryHeaderInfo.className = 'flex items-center gap-2';
  summaryHeaderRow.appendChild(summaryHeaderInfo);

  const summaryBadge = document.createElement('span');
  summaryBadge.className = 'inline-flex items-center justify-center rounded-full font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 w-7 h-7 text-[11px] shadow-sm bg-blue-600 text-white';
  summaryBadge.textContent = 'PL';
  summaryHeaderInfo.appendChild(summaryBadge);

  const summaryHeaderText = document.createElement('div');
  summaryHeaderText.className = 'space-y-1';
  const summaryTitle = document.createElement('div');
  summaryTitle.className = 'font-semibold text-sm text-gray-900';
  summaryTitle.textContent = 'Plan-Details';
  const summarySubtitle = document.createElement('div');
  summarySubtitle.className = 'text-sm text-gray-500';
  summarySubtitle.textContent = 'Noch kein Plan';
  const summaryMeta = document.createElement('div');
  summaryMeta.className = 'text-xs text-gray-400';
  summaryMeta.textContent = 'Plan-ID: —';
  summaryHeaderText.append(summaryTitle, summarySubtitle, summaryMeta);
  summaryHeaderInfo.appendChild(summaryHeaderText);

  const summaryHeaderButton = document.createElement('button');
  summaryHeaderButton.type = 'button';
  summaryHeaderButton.className = 'inline-flex items-center px-2.5 py-1 text-xs' +
    ' font-medium text-gray-600 border border-gray-200 rounded-md hover:text-gray-900 hover:border-gray-300' +
    ' focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1';
  summaryHeaderButton.textContent = 'Planliste';
  summaryHeaderRow.appendChild(summaryHeaderButton);

  const summaryBody = document.createElement('div');
  summaryBody.className = 'flex-1 overflow-y-auto p-4 space-y-4 bg-white';
  summaryAside.appendChild(summaryBody);

  const summaryStatusCard = document.createElement('div');
  summaryStatusCard.className = 'rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 space-y-1';
  const summaryStatusTitle = document.createElement('div');
  summaryStatusTitle.className = 'font-semibold text-gray-900';
  summaryStatusTitle.textContent = 'Status';
  const summaryStatusValue = document.createElement('div');
  summaryStatusValue.className = 'text-sm font-semibold text-gray-900';
  summaryStatusValue.textContent = 'Keine Berechnung';
  const summaryStatusTimestamp = document.createElement('div');
  summaryStatusTimestamp.className = 'text-[11px] text-gray-500';
  summaryStatusTimestamp.textContent = '—';
  summaryStatusCard.append(summaryStatusTitle, summaryStatusValue, summaryStatusTimestamp);
  summaryBody.appendChild(summaryStatusCard);

  const summaryRulesCard = document.createElement('div');
  summaryRulesCard.className = 'rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-700 space-y-2';
  const summaryRulesTitle = document.createElement('div');
  summaryRulesTitle.className = 'font-semibold';
  summaryRulesTitle.textContent = 'Aktive Regeln';
  const summaryRulesList = document.createElement('div');
  summaryRulesList.className = 'flex flex-wrap gap-1';
  const summaryRulesPlaceholder = document.createElement('span');
  summaryRulesPlaceholder.className = 'text-xs text-blue-500';
  summaryRulesPlaceholder.textContent = 'Noch kein Plan berechnet.';
  summaryRulesList.appendChild(summaryRulesPlaceholder);
  summaryRulesCard.append(summaryRulesTitle, summaryRulesList);
  summaryBody.appendChild(summaryRulesCard);

  const summaryDetailsCard = document.createElement('div');
  summaryDetailsCard.className = 'rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700 space-y-2 shadow-sm';
  const summaryDetailsTitle = document.createElement('div');
  summaryDetailsTitle.className = 'font-semibold text-gray-900';
  summaryDetailsTitle.textContent = 'Zusammenfassung';
  const summaryMetaList = document.createElement('div');
  summaryMetaList.className = 'space-y-2';
  summaryDetailsCard.append(summaryDetailsTitle, summaryMetaList);
  summaryBody.appendChild(summaryDetailsCard);

  const summaryMetaEntries = new Map();
  const metaRows = [
    ['score', 'Score', '—'],
    ['objective', 'Zielwert', '—'],
    ['slots', 'Slots', '—'],
    ['created', 'Erstellt', '—'],
  ];
  metaRows.forEach(([key, label, value]) => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between gap-2';
    const labelEl = document.createElement('span');
    labelEl.className = 'text-gray-500';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'font-semibold text-gray-900';
    valueEl.textContent = value;
    row.append(labelEl, valueEl);
    summaryMetaList.appendChild(row);
    summaryMetaEntries.set(key, valueEl);
  });

  return {
    aside: summaryAside,
    refs: {
      headerBadge: summaryBadge,
      headerTitle: summaryTitle,
      headerSubtitle: summarySubtitle,
      headerMeta: summaryMeta,
      headerButton: summaryHeaderButton,
      headerButton: summaryHeaderButton,
      statusValue: summaryStatusValue,
      statusTimestamp: summaryStatusTimestamp,
      rulesContainer: summaryRulesList,
      rulesPlaceholder: summaryRulesPlaceholder,
      metaEntries: summaryMetaEntries,
    },
  };
}
