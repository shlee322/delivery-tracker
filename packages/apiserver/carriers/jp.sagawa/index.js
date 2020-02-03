const axios = require('axios');
const { JSDOM } = require('jsdom');

const parseStatusId = s => {
  if (s.includes('集荷')) return 'at_pickup';
  if (s.includes('保管中')) return 'delivered';
  return 'in_transit';
};

// "02/01 16:59"
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
      .get(
        'http://k2k.sagawa-exp.co.jp/p/web/okurijosearch.do', {
          params: {
            okurijoNo: trackId,
          },
        },
      )
      .then(res => {
        const dom = new JSDOM(res.data);
        const [info, progresses] = dom.window.document.querySelectorAll('table.table_basic.table_okurijo_detail2');
        if (info.querySelectorAll('tr').length != 5) {
          return reject({
            code: 404,
            message: info.querySelectorAll('tr')[5].textContent,
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
          const [status, time, office] = history[i].querySelectorAll('td');
          shippingInformation.progresses.push({
            time: getTime(time.textContent),
            location: { name: office.textContent, },
            status: { id: parseStatusId(status.textContent), text: status.textContent },
          });
        }

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered')
            shippingInformation.to = { time: lastProgress.time };
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'Sagawa',
    tel: '+810120189595',
  },
  getTrack,
};
