const axios = require('axios');
const { JSDOM } = require('jsdom');

const STATUS_MAP = {
  0: { id: 'information_received', text: '방문예정' },
  1: { id: 'at_pickup', text: '상품인수' },
  2: { id: 'in_transit', text: '이동중' },
  3: { id: 'out_for_delivery', text: '배송출발' },
  4: { id: 'delivered', text: '배송완료' },
};

const STR_TO_STATUS = {
  '입항적하목록 제출': 0,
  반입신고: 1,
  배달준비: 3,
  배달완료: 4,
};

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('http://service.cwaycorp.com/tracking', {
        params: {
          hbl: trackId,
        },
      })
      .then(res => {
        const dom = new JSDOM(res.data);
        const { document } = dom.window;

        const err = document.querySelector('.callout-danger');
        if (err) {
          return reject({
            code: 404,
            message: err.textContent
              .replace(/^\s+|\s+$/g, '')
              .replace(/\s\s+/g, ' '),
          });
        }

        const information = document
          .querySelector('tbody:nth-child(1)')
          .querySelectorAll('tr > td:nth-child(2)');
        const unipass = document.querySelectorAll(
          '#unipass_tracking .box:nth-child(2) .table-striped tr:not(:first-child)'
        );
        const korea = document.querySelectorAll(
          '#korea_tracking .box:nth-child(2) table tbody tr'
        );

        return {
          information,
          unipass,
          korea,
        };
      })
      .then(({ information, unipass, korea }) => {
        const shippingInformation = {
          progresses: [],
        };

        unipass.forEach(element => {
          const time = (function convertTime(t) {
            return `${t.replace(' ', 'T')}+09:00`;
          })(element.querySelector('td:nth-child(3) p').textContent);

          const locationName = element
            .querySelector('td:nth-child(2)')
            .textContent.replace(/^\s+|\s+$/g, '');

          shippingInformation.progresses.unshift({
            time,
            location: locationName !== '' ? { name: locationName } : undefined,
            status: STATUS_MAP[2],
            description: element
              .querySelector('td:nth-child(4)')
              .textContent.replace(/^\s+|\s+$/g, ''),
          });
        });

        korea.forEach(element => {
          const time = (function convertTime(dateContent, timeContent) {
            return `${dateContent}T${timeContent}:00+09:00`;
          })(
            element.querySelector('td:nth-child(1)').textContent,
            element.querySelector('td:nth-child(2)').textContent
          );

          shippingInformation.progresses.push({
            time,
            location: {
              name: element.querySelector('td:nth-child(3)').textContent,
            },
            status: STATUS_MAP[2],
            description: element
              .querySelector('td:nth-child(4)')
              .textContent.replace(/^\s+|\s+$/g, '')
              .replace(/\s\s+/g, ' '),
          });
        });

        shippingInformation.progresses.forEach(progress => {
          // eslint-disable-next-line no-restricted-syntax
          for (const key in STR_TO_STATUS) {
            if (progress.description.includes(key)) {
              // eslint-disable-next-line no-param-reassign
              progress.status = STATUS_MAP[STR_TO_STATUS[key]];
              break;
            }
          }
        });

        if (shippingInformation.progresses.length > 0)
          shippingInformation.state =
            shippingInformation.progresses[
              shippingInformation.progresses.length - 1
            ].status;
        else
          shippingInformation.state = {
            id: 'information_received',
            text: '방문예정',
          };

        shippingInformation.to = {
          name: information[0].textContent,
          time:
            shippingInformation.state.id === 'delivered'
              ? shippingInformation.progresses[
                  shippingInformation.progresses.length - 1
                ].time
              : undefined,
        };
        shippingInformation.item = information[2].textContent;

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: 'CWAY (Woori Express)',
    tel: '+8215884899',
  },
  getTrack,
};
