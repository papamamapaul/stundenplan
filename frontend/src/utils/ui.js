export function formatError(err) {
  if (!err) return 'Unbekannter Fehler';
  if (typeof err === 'string') return err;
  if (typeof err.detail === 'string') return err.detail;
  let raw = err.message;
  if (!raw) {
    raw = typeof err.toString === 'function' ? err.toString() : '';
  }
  if (typeof raw !== 'string') {
    raw = String(raw);
  }
  if (!raw) return 'Unbekannter Fehler';
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.detail === 'string') return parsed.detail;
      if (typeof parsed.message === 'string') return parsed.message;
    }
  } catch {
    // ignore JSON parse errors
  }
  return raw;
}

export function confirmModal(options = {}) {
  const {
    title = 'Bestätigung',
    message = '',
    confirmText = 'OK',
    cancelText = 'Abbrechen',
    confirmButtonClass = 'btn btn-sm btn-error',
    cancelButtonClass = 'btn btn-sm btn-ghost',
  } = options;

  return new Promise(resolve => {
    let resolved = false;

    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const box = document.createElement('div');
    box.className = 'modal-box space-y-4';

    if (title) {
      const heading = document.createElement('h3');
      heading.className = 'font-bold text-lg';
      heading.textContent = title;
      box.appendChild(heading);
    }

    if (message) {
      const body = document.createElement('p');
      body.className = 'text-sm';
      body.textContent = message;
      box.appendChild(body);
    }

    const actions = document.createElement('div');
    actions.className = 'modal-action';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = cancelButtonClass;
    cancelBtn.textContent = cancelText;

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = confirmButtonClass;
    confirmBtn.textContent = confirmText;

    actions.append(cancelBtn, confirmBtn);
    box.appendChild(actions);

    const backdrop = document.createElement('form');
    backdrop.method = 'dialog';
    backdrop.className = 'modal-backdrop';
    const closeButton = document.createElement('button');
    closeButton.textContent = 'Schließen';
    backdrop.appendChild(closeButton);

    dialog.append(box, backdrop);
    document.body.appendChild(dialog);

    function cleanup(result) {
      if (resolved) return;
      resolved = true;
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => cleanup(false));
    confirmBtn.addEventListener('click', () => cleanup(true));
    backdrop.addEventListener('submit', event => {
      event.preventDefault();
      cleanup(false);
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      cleanup(false);
    });

    dialog.showModal();
  });
}

export function formModal(options = {}) {
  const {
    title = '',
    message = '',
    fields = [],
    confirmText = 'Speichern',
    cancelText = 'Abbrechen',
    validate,
  } = options;

  return new Promise(resolve => {
    let resolved = false;

    const dialog = document.createElement('dialog');
    dialog.className = 'modal';

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'modal-box space-y-4';

    if (title) {
      const heading = document.createElement('h3');
      heading.className = 'font-bold text-lg';
      heading.textContent = title;
      form.appendChild(heading);
    }

    if (message) {
      const body = document.createElement('p');
      body.className = 'text-sm';
      body.textContent = message;
      form.appendChild(body);
    }

    const controls = document.createElement('div');
    controls.className = 'space-y-3';

    const refs = new Map();

    fields.forEach(field => {
      const wrapper = document.createElement('label');
      wrapper.className = 'form-control w-full';

      if (field.label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'label-text font-medium';
        labelEl.textContent = field.label;
        const labelWrap = document.createElement('div');
        labelWrap.className = 'label';
        labelWrap.appendChild(labelEl);
        wrapper.appendChild(labelWrap);
      }

      let input;
      if (field.type === 'textarea') {
        input = document.createElement('textarea');
        input.className = 'textarea textarea-bordered w-full';
        input.rows = field.rows || 3;
      } else if (field.type === 'select') {
        input = document.createElement('select');
        input.className = 'select select-bordered w-full';
        const opts = Array.isArray(field.options) ? field.options : [];
        input.innerHTML = opts.map(opt => {
          if (typeof opt === 'string') {
            return `<option value="${opt}">${opt}</option>`;
          }
          const value = opt.value ?? '';
          const label = opt.label ?? opt.value ?? '';
          return `<option value="${value}">${label}</option>`;
        }).join('');
        if (field.value !== undefined && field.value !== null) {
          input.value = String(field.value);
        }
      } else {
        input = document.createElement('input');
        input.type = field.type || 'text';
        input.className = 'input input-bordered w-full';
      }

      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.type !== 'select' && field.value !== undefined && field.value !== null) input.value = field.value;
      if (field.required) input.required = true;
      if (field.maxLength) input.maxLength = field.maxLength;

      refs.set(field.name, input);
      wrapper.appendChild(input);
      controls.appendChild(wrapper);
    });

    form.appendChild(controls);

    const actions = document.createElement('div');
    actions.className = 'modal-action';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-sm btn-ghost';
    cancelBtn.textContent = cancelText;

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-sm btn-primary';
    submitBtn.textContent = confirmText;

    actions.append(cancelBtn, submitBtn);
    form.appendChild(actions);

    dialog.appendChild(form);
    document.body.appendChild(dialog);

    function gatherValues() {
      const values = {};
      refs.forEach((input, name) => {
        if (input instanceof HTMLTextAreaElement) {
          values[name] = input.value.trim();
        } else if (input.type === 'number') {
          const trimmed = input.value.trim();
          values[name] = trimmed === '' ? null : Number(trimmed);
        } else {
          values[name] = input.value.trim();
        }
      });
      return values;
    }

    function cleanup(result) {
      if (resolved) return;
      resolved = true;
      dialog.close();
      dialog.remove();
      resolve(result);
    }

    cancelBtn.addEventListener('click', () => cleanup(null));
    form.addEventListener('submit', event => {
      event.preventDefault();
      const values = gatherValues();
      if (typeof validate === 'function') {
        const error = validate(values);
        if (error) {
          // simple inline feedback
          const msg = document.createElement('div');
          msg.className = 'alert alert-error text-sm';
          msg.textContent = error;
          form.insertBefore(msg, actions);
          setTimeout(() => msg.remove(), 3000);
          return;
        }
      }
      cleanup(values);
    });

    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      cleanup(null);
    });

    dialog.showModal();
  });
}
