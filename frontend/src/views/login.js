import { login } from '../store/auth.js';

export function createLoginView() {
  const container = document.createElement('section');
  container.className = 'flex min-h-[60vh] items-center justify-center';

  const card = document.createElement('div');
  card.className = 'w-full max-w-md rounded-2xl border border-base-200 bg-white p-8 shadow-lg space-y-6';

  const header = document.createElement('div');
  header.className = 'space-y-1 text-center';
  header.innerHTML = `
    <p class="text-sm font-semibold uppercase tracking-wide text-primary">KlassenTakt</p>
    <h1 class="text-2xl font-bold">Anmeldung</h1>
    <p class="text-sm opacity-70">Bitte melde dich mit deinen Zugangsdaten an.</p>
  `;
  card.appendChild(header);

  const status = document.createElement('div');
  status.className = 'text-sm text-red-500 hidden';
  card.appendChild(status);

  const form = document.createElement('form');
  form.className = 'space-y-4';

  const emailField = createInputField('E-Mail', 'email', 'lehrer@schule.de', 'admin@example.com');
  const passwordField = createInputField('Passwort', 'password', '••••••••', 'admin');
  passwordField.input.type = 'password';

  form.append(emailField.wrapper, passwordField.wrapper);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary w-full';
  submit.textContent = 'Anmelden';
  form.appendChild(submit);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    status.classList.add('hidden');
    submit.disabled = true;
    submit.textContent = 'Anmeldung…';
    try {
      await login(emailField.input.value, passwordField.input.value);
    } catch (err) {
      status.textContent = err.message || 'Login fehlgeschlagen';
      status.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Anmelden';
    }
  });

  card.appendChild(form);
  container.appendChild(card);
  return container;
}

function createInputField(label, id, placeholder = '', defaultValue = '') {
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
  if (defaultValue) {
    input.value = defaultValue;
  }
  wrapper.append(labelText, input);
  return { wrapper, input };
}
