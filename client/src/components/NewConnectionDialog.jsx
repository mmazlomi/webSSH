import React, { useState } from 'react';

const EMPTY = {
  host: '',
  port: '22',
  username: '',
  auth: 'password',
  password: '',
  privateKey: '',
  passphrase: '',
};

export default function NewConnectionDialog({ onCancel, onConnect }) {
  const [f, setF] = useState(EMPTY);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!f.host.trim() || !f.username.trim()) return;
    onConnect({
      host: f.host.trim(),
      port: Number(f.port) || 22,
      username: f.username.trim(),
      password: f.auth === 'password' ? f.password : '',
      privateKey: f.auth === 'key' ? f.privateKey : '',
      passphrase: f.auth === 'key' ? f.passphrase : '',
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h3 className="modal__title">New SSH session</h3>

        <label className="field">
          <span>Host</span>
          <input
            value={f.host}
            onChange={set('host')}
            autoFocus
            placeholder="192.168.1.3 or example.com"
          />
        </label>

        <label className="field">
          <span>Port</span>
          <input
            type="number"
            min="1"
            max="65535"
            value={f.port}
            onChange={set('port')}
          />
        </label>

        <label className="field">
          <span>Username</span>
          <input value={f.username} onChange={set('username')} />
        </label>

        <label className="field">
          <span>Auth</span>
          <select value={f.auth} onChange={set('auth')}>
            <option value="password">Password</option>
            <option value="key">Private key</option>
          </select>
        </label>

        {f.auth === 'password' ? (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={f.password}
              onChange={set('password')}
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span>Private key</span>
              <textarea
                rows={4}
                spellCheck={false}
                value={f.privateKey}
                onChange={set('privateKey')}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            </label>
            <label className="field">
              <span>Passphrase</span>
              <input
                type="password"
                value={f.passphrase}
                onChange={set('passphrase')}
              />
            </label>
          </>
        )}

        <div className="modal__actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Connect
          </button>
        </div>
      </form>
    </div>
  );
}
