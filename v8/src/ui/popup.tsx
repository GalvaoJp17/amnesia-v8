// Placeholder popup script. Real UI will be implemented in follow-up commits.
const root = document.getElementById('root');

if (root) {
  const heading = document.createElement('h1');
  heading.textContent = 'Amnesia AI Shield';

  const message = document.createElement('p');
  message.textContent = 'Popup controls will be implemented soon.';
  message.style.fontSize = '0.9rem';
  message.style.opacity = '0.8';

  root.appendChild(heading);
  root.appendChild(message);
}
