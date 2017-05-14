const auth = require('./authorize');
const add = require('./add');

const $ = document.querySelector.bind(document);
$.all = document.querySelectorAll.bind(document);

function updateAuth(authed) {
  $('#authorize-container').style.display = authed ? 'none' : null;
  $('#restricted').style.display = authed ? null : 'none';
}

$('#authorize').addEventListener('click', () => {
  if (!auth.isAuthorized()) {
    auth.start();
  }
});

$('#deauthorize').addEventListener('click', () => {
  if (auth.isAuthorized()) {
    auth.deauthorize();
  }
});

updateAuth(auth.isAuthorized());

auth.on('error', (err) => alert(`error: ${err.message}`));
auth.on('authorized', () => {
  auth.stop();
  updateAuth(true);
});
auth.on('deauthorized', () => {
  updateAuth(false);
});

add.on('error', (err) => alert(`add error: ${err.message}`));
add.on('info', (info) => {
  $('#info').textContent = info;
});

$('#view-selector').addEventListener('change', function() {
  for (let node of $.all('.view')) node.style.display = 'none';
  $(`#view-${this.value}`).style.display = null;
});

const singleInputs = $.all('#view-single .single-input');
for (let input of singleInputs) {
  input.addEventListener('keydown', (e) => {
    if (e.keyCode === 13) {
      e.preventDefault();
      e.stopPropagation();
      addSingle();
    }
  });
}

$('#single-add').addEventListener('click', () => addSingle());

function addSingle() {
  const data = {};
  for (let input of singleInputs) {
    data[input.name] = input.value.trim();
    input.value = '';
  }

  add.one(data);
  singleInputs[0].focus();
}

$('#bulk-add').addEventListener('click', () => {
  add.bulk($('#bulk-input').value);
});

$('#loading').style.display = 'none';
