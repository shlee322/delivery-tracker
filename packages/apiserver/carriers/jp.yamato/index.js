const axios = require('axios');
const { Iconv } = require('iconv');

const { JSDOM } = require('jsdom');
const qs = require('querystring');

const iconv = new Iconv('SHIFT_JIS', 'UTF-8//TRANSLIT//IGNORE');

const parseStatusId = s => {
  if (s.includes('荷物受付')) return 'at_pickup';
  if (s.includes('保管中')) return 'delivered';
  return 'in_transit';
};

// 02/01 12:19
function getTime(time) {
  const dateObj = new Date(time);

  const year = new Date().getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  const hours = String(dateObj.getHours()).padStart(2, '0');
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');

  // TODO : timezone convert
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}


function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .post(
        'http://toi.kuronekoyamato.co.jp/cgi-bin/tneko',
        qs.stringify({
          number00: 1,
          number01: trackId,
        }),
        {
          responseType: 'arraybuffer',
        }
      )
      .then(res => {
        const dom = new JSDOM(iconv.convert(res.data).toString('utf-8'));
        const progresses = dom.window.document.querySelector('table.meisai');
        if (!progresses) {
          const info = dom.window.document.querySelectorAll('table.saisin tr');
          return reject({
            code: 404,
            message: `${info[2].textContent.trim()} ${info[3].textContent.trim()}`,
          });
        }
        return { progresses };
      })
      .then(({ progresses }) => {
        const shippingInformation = {
          state: { id: 'information_received', text: 'information received' },
          progresses: [],
        };

        const history = progresses.querySelectorAll('tr');

        for (let i = 1; i < history.length; i += 1) {
          const [_, status, date, time, office, __] = history[i].querySelectorAll('td');
          shippingInformation.progresses.push({
            time: getTime(`${date.textContent} ${time.textContent}`),
            location: { name: office.textContent, },
            status: { id: parseStatusId(status.textContent), text: status.textContent },
          });
        }

        // const lastProgress =
        //   shippingInformation.progresses[
        //     shippingInformation.progresses.length - 1
        //   ];
        // if (lastProgress) {
        //   shippingInformation.state = lastProgress.status;
        //   if (lastProgress.status.id === 'delivered')
        //     shippingInformation.to = { time: lastProgress.time };
        // }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'Kuroneko Yamato',
    tel: '+810120189595',
  },
  getTrack,
};
