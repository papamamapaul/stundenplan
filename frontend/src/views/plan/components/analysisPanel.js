export function createAnalysisPanel({ state }) {
  const element = document.createElement('div');
  element.className = 'space-y-4 hidden';

  function render(resultsSection) {
    element.innerHTML = '';
    if (state.activeTab !== 'analysis') {
      element.classList.add('hidden');
      if (resultsSection) resultsSection.classList.remove('hidden');
      return;
    }
    element.classList.remove('hidden');
    if (resultsSection) resultsSection.classList.add('hidden');

    if (state.analysisError) {
      const alert = document.createElement('div');
      alert.className = 'alert alert-error text-sm';
      alert.textContent = state.analysisError;
      element.appendChild(alert);
      return;
    }

    const data = state.analysis;
    if (!data || data.empty) {
      const info = document.createElement('div');
      info.className = 'alert alert-info text-sm';
      info.textContent = 'Analyse liefert keine Daten.';
      element.appendChild(info);
      return;
    }

    const layout = document.createElement('div');
    layout.className = 'grid gap-4 lg:grid-cols-2';

    layout.appendChild(renderAnalysisCard('Klassen – Wochenstunden', renderSimpleTable(
      ['Klasse', 'Stunden'],
      data.classes?.map(row => [row.klasse, row.stunden]) || []
    )));

    layout.appendChild(renderAnalysisCard('Lehrer – Deputat', renderSimpleTable(
      ['Lehrer', 'Stunden', 'Deputat'],
      data.teachers?.map(row => [row.lehrer, row.stunden, row.deputat]) || []
    )));

    layout.appendChild(renderAnalysisCard('Klasse × Fach', renderSimpleTable(
      ['Klasse', 'Fach', 'Stunden'],
      data.class_subjects?.map(row => [row.klasse, row.fach, row.stunden]) || []
    )));

    if (data.flags) {
      Object.entries(data.flags).forEach(([key, counts]) => {
        layout.appendChild(renderAnalysisCard(
          `Flag: ${key}`,
          renderSimpleTable(['Wert', 'Anzahl'], Object.entries(counts))
        ));
      });
    }

    element.appendChild(layout);
  }

  function renderAnalysisCard(title, content) {
    const card = document.createElement('article');
    card.className = 'card border border-base-200 bg-base-100 shadow-sm';
    const body = document.createElement('div');
    body.className = 'card-body space-y-3 text-sm';
    const heading = document.createElement('h3');
    heading.className = 'card-title text-base';
    heading.textContent = title;
    body.appendChild(heading);
    if (content instanceof HTMLElement) {
      body.appendChild(content);
    } else if (typeof content === 'string') {
      const pre = document.createElement('pre');
      pre.className = 'text-xs overflow-x-auto';
      pre.textContent = content;
      body.appendChild(pre);
    } else {
      const wrapper = document.createElement('div');
      wrapper.className = 'text-xs text-gray-500';
      wrapper.textContent = 'Keine Daten';
      body.appendChild(wrapper);
    }
    card.appendChild(body);
    return card;
  }

  function renderSimpleTable(headers, rows) {
    const table = document.createElement('table');
    table.className = 'table table-sm';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    if (!rows || !rows.length) {
      const empty = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = headers.length;
      cell.className = 'text-center text-xs opacity-60';
      cell.textContent = 'Keine Daten';
      empty.appendChild(cell);
      tbody.appendChild(empty);
    } else {
      rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }
    table.appendChild(tbody);
    return table;
  }

  return {
    element,
    render,
  };
}
