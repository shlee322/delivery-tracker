const axios = require('axios');

const STATUS_ID_MAP = {
  접수완료: 'information_received',
  배송완료: 'delivered',
};

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .get('https://kdexp.com/newDeliverySearch.kd', {
        params: {
          barcode: trackId,
        },
      })
      .then(res => {
        if (res.data.result !== 'suc') {
          reject({
            code: 404,
            message:
              '운송장이 등록되지 않았거나 업체에서 상품을 준비중이니 업체로 문의해주시기 바랍니다.',
          });
          return;
        }

        const { info } = res.data;

        const shippingInformation = {
          from: {
            name: info.send_name,
          },
          to: {
            name: info.re_name,
          },
          state: { id: 'information_received', text: '접수완료' },
          item: info.prod,
          progresses: [],
        };

        res.data.items.forEach(progress => {
          shippingInformation.progresses.push({
            time:
              progress.reg_date !== '알수없음'
                ? `${progress.reg_date.replace(' ', 'T')}+09:00`
                : undefined,
            status: {
              id: STATUS_ID_MAP[progress.stat] || 'in_transit',
              text: progress.stat,
            },
            location: { name: progress.location },
            description: `연락처: ${progress.tel}`,
          });
        });

        const lastProgress =
          shippingInformation.progresses[
            shippingInformation.progresses.length - 1
          ];
        if (lastProgress) {
          shippingInformation.state = lastProgress.status;
          if (lastProgress.status.id === 'delivered')
            shippingInformation.to.time = lastProgress.time;
        }

        resolve(shippingInformation);
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '경동택배',
    tel: '+8218995368',
  },
  getTrack,
};
