const auth = require('./authorize');
const xml = require('xml');
const xml2js = require('xml2js');
const csv = require('csv');
const superagent = require('superagent');
const Emitter = require('events').EventEmitter;

const emitter = new Emitter();

function formatContactBody(contact) {
  return [{
    'gd:name': [{
      // Why does this need to be here???
    }, {
      'gd:fullName': contact.name
    }]
  }, {
    'gd:email': {
      _attr: {
        rel: 'http://schemas.google.com/g/2005#work',
        address: contact.email,
        primary: 'true'
      }
    }
  }];
}

function one(data) {
  const body = xml({
    'atom:entry': [{
      _attr: {
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        'xmlns:gd': 'http://schemas.google.com/g/2005'
      }
    }, {
      'atom:category': {
        _attr: {
          scheme: 'http://schemas.google.com/g/2005#kind',
          term: 'http://schemas.google.com/contact/2008#contact'
        }
      }
    }].concat(formatContactBody(data))
  });

  post(body);
}

// TODO: support >100 contacts
function bulk(rawData) {
  csv.parse(rawData, (err, parsed) => {
    if (err) {
      return emitter.emit('error', err);
    }

    const data = parsed.map((entry) => ({
      name: (entry[0] || '').trim(),
      email: (entry[1] || '').trim()
    }));

    list((err, existing) => {
      if (err) {
        return emitter.emit('error', err);
      }

      const indexed = Object.create(null);
      for (let contact of existing) {
        indexed[contact.name] = contact;
      }

      const addContacts = data.filter((contact) => !indexed[contact.name]);

      if (addContacts.length === 0) {
        return emitter.emit('info', 'All contacts already exist.');
      }

      post(bulkTransform(addContacts));
    });
  });
}

function bulkTransform(contacts) {
  return xml({
    feed: [{
      _attr: {
        xmlns: 'http://www.w3.org/2005/Atom',
        'xmlns:gContact': 'http://schemas.google.com/contact/2008',
        'xmlns:gd': 'http://schemas.google.com/g/2005',
        'xmlns:batch': 'http://schemas.google.com/gdata/batch'
      }
    }/*, {
      category: {
        _attr: {
          scheme: 'http://schemas.google.com/g/2005#kind',
          term: 'http://schemas.google.com/g/2008#contact'
        }
      }
    }*/].concat(contacts.map((contact, index) => {
      return {
        entry: [{
          'batch:id': index + 1
        }, {
          'batch:operation': {
            _attr: {
              type: 'insert'
            }
          }
        }, {
          category: {
            _attr: {
              scheme: 'http://schemas.google.com/g/2005#kind',
              term: 'http://schemas.google.com/g/2008#contact'
            }
          }
        }].concat(formatContactBody(contact))
      };
    }))
  }, {
    declaration: true
  });
}

// TODO: stream, use next link
function list(callback) {
  superagent.get('https://www.google.com/m8/feeds/contacts/opalschool.org/full')
    .set('gdata-version', '3.0')
    .set('authorization', `Bearer ${auth.getAccessToken()}`)
    .buffer()
    .end((err, res) => {
      if (err) callback(err);
      else {
        xml2js.parseString(res.text, (err, data) => {
          if (err) callback(err);
          else callback(null, fixList(data));
        });
      }
    });
}

function fixList(data) {
  return data.feed.entry.map((entry) => ({
    name: entry['gd:name'][0]['gd:fullName'][0],
    email: entry['gd:email'][0].$.address
  }));
}

function post(data) {
  (function attempt(n) {
    superagent.post('https://www.google.com/m8/feeds/contacts/opalschool.org/full')
      .set('gdata-version', '3.0')
      .set('authorization', `Bearer ${auth.getAccessToken()}`)
      .set('content-type', 'application/atom+xml')
      .send(data)
      .end((err, res) => {
        if (err) {
          if (n < 4 && (res.unauthorized || res.forbidden)) {
            auth.refresh((err) => {
              if (err) emitter.emit('error', err);
              else attempt(n + 1)
            });
          } else {
            emitter.emit('error', err);
          }
        } else {
          emitter.emit('info', 'Contacts added.');
        }
      });
  })(0);
}

module.exports = emitter;
emitter.one = one;
emitter.bulk = bulk;
