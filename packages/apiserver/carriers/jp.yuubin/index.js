const axios = require('axios');
const { JSDOM } = require('jsdom');


const parseStatusId = s => {
  if (s.includes('Posting/Collection')) return 'at_pickup';
  if (s.includes('Final delivery')) return 'delivered';
  return 'in_transit';
};

// "06/20/2019 16:33"
function getTime(location, time) {
  // WARNING : Timezone is ignored.
  const dateObj = new Date(time);

  const year = dateObj.getFullYear();
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
        'http://tracking.post.japanpost.jp/service/singleSearch.do', {
          params: {
            'org.apache.struts.taglib.html.TOKEN': '',
            searchKind: 5002,
            locale: 'ja', // en, ja
            SVID: '',
            reqCodeNo1: trackId,
          },
        },
      )
      .then(res => {
        const dom = new JSDOM(res.data);
        const progresses = dom.window.document.querySelector('table[summary="履歴情報"]')
        if (!progresses) {
          return reject({
            code: 404,
            message: dom.window.document.querySelectorAll('td ,txt_l')[1].textContent,
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

        for (let i = 2; i < history.length; i += 2) {
          const [time, status, _, office, location] = history[i].querySelectorAll('td');
          shippingInformation.progresses.push({
            time: getTime(location.textContent, time.textContent),
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
    name: 'Japan Post',
    tel: '+810570046111',
  },
  getTrack,
};
