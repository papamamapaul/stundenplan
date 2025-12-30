import { createAdminUser, fetchAdminUsers, getAuthState } from '../store/auth.js';
import { formatError } from '../utils/ui.js';
import { fetchAccounts, createAccount, fetchAccountUsers, createAccountUser } from '../api/accounts.js';
import { getCurrentAccountId } from '../api/helpers.js';

export function createAdminUsersView() {
  const container = document.createElement('section');
  container.className = 'space-y-6';

  const header = document.createElement('div');
  header.innerHTML = `
    <h1 class="text-2xl font-semibold">Benutzerverwaltung</h1>
    <p class="text-sm opacity-70">Verwalte Schulen und Benutzerkonten.</p>
  `;
  container.appendChild(header);

  const auth = getAuthState();
  const isSuperuser = auth.user?.is_superuser;

  if (isSuperuser) {
    container.appendChild(renderGlobalAdminSection());
    container.appendChild(renderGlobalUsersSection());
    return container;
  }

  const accountSection = renderSchoolAdminSection();
  container.appendChild(accountSection);
  return container;

  function renderGlobalAdminSection() {
    const card = document.createElement('div');
    card.className = 'card bg-base-100 shadow-sm border border-base-200';
    const body = document.createElement('div');
    body.className = 'card-body space-y-4';
    body.innerHTML = `
      <div>
        <h2 class="card-title text-lg">Schulen</h2>
        <p class="text-sm opacity-70">Lege neue Schul-Accounts inklusive Admin-Zugang an.</p>
      </div>
    `;

    const status = document.createElement('p');
    status.className = 'text-sm text-red-500 hidden';

    const tableWrap = document.createElement('div');
    tableWrap.className = 'overflow-x-auto';
    const table = document.createElement('table');
    table.className = 'table table-sm';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Schule</th>
          <th>Admin</th>
          <th>Erstellt</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    tableWrap.appendChild(table);

    const form = document.createElement('form');
    form.className = 'grid gap-3 md:grid-cols-2';
    const schoolField = createInput('Schulname', 'school-name', 'Grundschule Beispiel');
    schoolField.wrapper.classList.add('md:col-span-2');
    const descField = createInput('Beschreibung', 'school-desc', 'Optional');
    descField.wrapper.classList.add('md:col-span-2');
    const adminEmail = createInput('Admin-E-Mail', 'admin-email', 'admin@schule.de');
    const adminName = createInput('Admin-Name', 'admin-name', 'Frau Beispiel');
    const adminPassword = createInput('Admin-Passwort', 'admin-password', 'Sicheres Passwort');
    adminPassword.input.type = 'password';

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary md:col-span-2';
    submit.textContent = 'Schule anlegen';

    [schoolField, descField, adminEmail, adminName, adminPassword].forEach(field => form.appendChild(field.wrapper));
    form.appendChild(submit);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.classList.add('hidden');
      submit.disabled = true;
      submit.textContent = 'Wird angelegt…';
      try {
        await createAccount({
          name: schoolField.input.value,
          description: descField.input.value || undefined,
          admin_email: adminEmail.input.value,
          admin_full_name: adminName.input.value || undefined,
          admin_password: adminPassword.input.value,
        });
        schoolField.input.value = '';
        descField.input.value = '';
        adminEmail.input.value = '';
        adminName.input.value = '';
        adminPassword.input.value = '';
        await loadAccounts();
      } catch (err) {
        status.textContent = err.message || 'Schule konnte nicht erstellt werden';
        status.classList.remove('hidden');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Schule anlegen';
      }
    });

    body.append(status, tableWrap, form);
    card.appendChild(body);

    async function loadAccounts() {
      try {
        const rows = await fetchAccounts();
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        rows.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.name}</td>
            <td>${row.admin_email || '—'}</td>
            <td>${new Date(row.created_at).toLocaleDateString()}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        status.textContent = formatError(err);
        status.classList.remove('hidden');
      }
    }

    loadAccounts();
    return card;
  }

  function renderGlobalUsersSection() {
    const layout = document.createElement('div');
    layout.className = 'grid gap-6 lg:grid-cols-[2fr_minmax(0,1fr)]';

    const listCard = document.createElement('div');
    listCard.className = 'card bg-base-100 shadow-sm border border-base-200';
    const listBody = document.createElement('div');
    listBody.className = 'card-body space-y-4';
    const listTitle = document.createElement('h2');
    listTitle.className = 'card-title text-lg';
    listTitle.textContent = 'Alle Benutzer';
    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    const tableEl = document.createElement('table');
    tableEl.className = 'table table-sm';
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>E-Mail</th>
          <th>Name</th>
          <th>Rolle</th>
          <th>Account</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    table.appendChild(tableEl);
    listBody.append(listTitle, table);
    listCard.appendChild(listBody);

    const formCard = document.createElement('div');
    formCard.className = 'card bg-base-100 shadow-sm border border-base-200';
    const formBody = document.createElement('div');
    formBody.className = 'card-body space-y-4';
    const formTitle = document.createElement('h2');
    formTitle.className = 'card-title text-lg';
    formTitle.textContent = 'Neues Benutzerkonto';
    const status = document.createElement('p');
    status.className = 'text-sm text-red-500 hidden';

    const form = document.createElement('form');
    form.className = 'space-y-3';
    const emailField = createInput('E-Mail', 'email', 'lehrer@schule.de');
    const nameField = createInput('Name', 'full_name', 'Frau Beispiel');
    const passwordField = createInput('Initial-Passwort', 'password', 'Sichere Zeichenfolge');
    passwordField.input.type = 'password';

    const accountField = document.createElement('label');
    accountField.className = 'form-control w-full';
    const accountLabel = document.createElement('span');
    accountLabel.className = 'label-text';
    accountLabel.textContent = 'Account-ID';
    const accountInput = document.createElement('input');
    accountInput.type = 'number';
    accountInput.className = 'input input-bordered';
    accountInput.placeholder = '1';
    accountField.append(accountLabel, accountInput);

    const roleField = document.createElement('label');
    roleField.className = 'form-control w-full';
    const roleText = document.createElement('span');
    roleText.className = 'label-text';
    roleText.textContent = 'Rolle';
    const roleSelect = document.createElement('select');
    roleSelect.className = 'select select-bordered';
    ['teacher', 'planner', 'viewer', 'owner'].forEach(role => {
      const opt = document.createElement('option');
      opt.value = role;
      opt.textContent = role;
      roleSelect.appendChild(opt);
    });
    roleField.append(roleText, roleSelect);

    form.append(emailField.wrapper, nameField.wrapper, passwordField.wrapper, accountField, roleField);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary w-full';
    submit.textContent = 'Benutzer anlegen';

    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.classList.add('hidden');
      submit.disabled = true;
      submit.textContent = 'Wird erstellt…';
      try {
        await createAdminUser({
          email: emailField.input.value,
          full_name: nameField.input.value || undefined,
          password: passwordField.input.value,
          account_id: accountInput.value ? Number(accountInput.value) : undefined,
          role: roleSelect.value,
        });
        emailField.input.value = '';
        nameField.input.value = '';
        passwordField.input.value = '';
        accountInput.value = '';
        loadUsers();
      } catch (err) {
        status.textContent = err.message || 'Benutzer konnte nicht angelegt werden';
        status.classList.remove('hidden');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Benutzer anlegen';
      }
    });

    formBody.append(formTitle, status, form, submit);
    formCard.appendChild(formBody);

    layout.append(listCard, formCard);

    async function loadUsers() {
      try {
        const rows = await fetchAdminUsers();
        const tbody = tableEl.querySelector('tbody');
        tbody.innerHTML = '';
        rows.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.email}</td>
            <td>${row.full_name || '—'}</td>
            <td>${row.role}</td>
            <td>${row.account_name || row.account_id || '—'}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        listBody.appendChild(errorBanner(formatError(err)));
      }
    }

    loadUsers();
    return layout;
  }

  function renderSchoolAdminSection() {
    const wrapper = document.createElement('div');
    wrapper.className = 'grid gap-6 lg:grid-cols-[2fr_minmax(0,1fr)]';
    const selectedAccountId = getCurrentAccountId();
    const account =
      auth.user?.accounts.find(a => Number(a.account_id) === Number(selectedAccountId)) ||
      auth.user?.accounts?.[0] ||
      null;
    const accountId = account?.account_id ?? selectedAccountId;

    const listCard = document.createElement('div');
    listCard.className = 'card bg-base-100 shadow-sm border border-base-200';
    const listBody = document.createElement('div');
    listBody.className = 'card-body space-y-4';
    listBody.innerHTML = `
      <div>
        <h2 class="card-title text-lg">Benutzer für ${account?.account_name || 'deinen Account'}</h2>
        <p class="text-sm opacity-70">Schul-Admins können hier Lehrer-Zugänge anlegen.</p>
      </div>
    `;

    const table = document.createElement('div');
    table.className = 'overflow-x-auto';
    const tableEl = document.createElement('table');
    tableEl.className = 'table table-sm';
    tableEl.innerHTML = `
      <thead>
        <tr>
          <th>E-Mail</th>
          <th>Name</th>
          <th>Rolle</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    table.appendChild(tableEl);
    listBody.appendChild(table);
    listCard.appendChild(listBody);

    const formCard = document.createElement('div');
    formCard.className = 'card bg-base-100 shadow-sm border border-base-200';
    const formBody = document.createElement('div');
    formBody.className = 'card-body space-y-4';
    const formTitle = document.createElement('h2');
    formTitle.className = 'card-title text-lg';
    formTitle.textContent = 'Lehrer anlegen';
    const status = document.createElement('p');
    status.className = 'text-sm text-red-500 hidden';

    const form = document.createElement('form');
    form.className = 'space-y-3';
    const emailField = createInput('E-Mail', 'teacher-email', 'lehrer@schule.de');
    const nameField = createInput('Name', 'teacher-name', 'Herr Beispiel');
    const passwordField = createInput('Passwort', 'teacher-password', 'Passwort');
    passwordField.input.type = 'password';
    form.append(emailField.wrapper, nameField.wrapper, passwordField.wrapper);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn btn-primary w-full';
    submit.textContent = 'Lehrer anlegen';

    form.addEventListener('submit', async event => {
      event.preventDefault();
      status.classList.add('hidden');
      submit.disabled = true;
      submit.textContent = 'Wird erstellt…';
      try {
        await createAccountUser(
          {
            email: emailField.input.value,
            full_name: nameField.input.value || undefined,
            password: passwordField.input.value,
            role: 'teacher',
          },
          { account_id: accountId },
        );
        emailField.input.value = '';
        nameField.input.value = '';
        passwordField.input.value = '';
        loadAccountUsers();
      } catch (err) {
        status.textContent = err.message || 'Lehrer konnte nicht angelegt werden';
        status.classList.remove('hidden');
      } finally {
        submit.disabled = false;
        submit.textContent = 'Lehrer anlegen';
      }
    });

    formBody.append(formTitle, status, form, submit);
    formCard.appendChild(formBody);

    wrapper.append(listCard, formCard);

    async function loadAccountUsers() {
      try {
        const rows = await fetchAccountUsers({ account_id: accountId });
        const tbody = tableEl.querySelector('tbody');
        tbody.innerHTML = '';
        rows.forEach(row => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${row.email}</td>
            <td>${row.full_name || '—'}</td>
            <td>${row.role}</td>
          `;
          tbody.appendChild(tr);
        });
      } catch (err) {
        listBody.appendChild(errorBanner(formatError(err)));
      }
    }

    loadAccountUsers();
    return wrapper;
  }
}

function createInput(label, id, placeholder = '') {
  const wrapper = document.createElement('label');
  wrapper.className = 'form-control w-full';
  const labelText = document.createElement('span');
  labelText.className = 'label-text';
  labelText.textContent = label;
  const input = document.createElement('input');
  input.id = id;
  input.type = 'text';
  input.placeholder = placeholder;
  input.className = 'input input-bordered w-full';
  wrapper.append(labelText, input);
  return { wrapper, input };
}

function errorBanner(message) {
  const div = document.createElement('div');
  div.className = 'alert alert-error';
  div.textContent = message;
  return div;
}
