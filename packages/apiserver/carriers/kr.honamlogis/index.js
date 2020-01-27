const axios = require('axios');

const STATUS_ID_MAP = {
  집하입고: 'at_pickup',
  영업소상차: 'at_pickup',
  배송출발: 'out_for_delivery',
  배송완료: 'delivered',
  배달완료: 'delivered',
};

function getTrack(trackId) {
  return new Promise((resolve, reject) => {
    axios
      .post(
        'http://www.honamlogis.co.kr/tracking_number.php',
        `SLIP_BARCD=${trackId}`
      )
      .then(res => {
        if (res.data.ODS0_TOTAL === 0) {
          reject({
            code: 404,
            message:
              '운송장이 등록되지 않았거나 업체에서 상품을 준비중이니 업체로 문의해주시기 바랍니다.',
          });
          return;
        }

        const data = res.data.ODS0[0];

        const shippingInformation = {
          from: {
            name: `${data.S_CUST_NM.substr(0, 1)}*${data.S_CUST_NM.substr(
              2,
              1
            )}`,
          },
          to: {
            name: `${data.R_CUST_NM.substr(0, 1)}*${data.R_CUST_NM.substr(
              2,
              1
            )}`,
            address: `${data.R_ZIP_ADDR.substr(
              0,
              data.R_ZIP_ADDR.length - 6
            )}******`,
          },
          state: { id: 'information_received', text: '방문예정' },
          progresses: [],
        };

        data.TRACKING_DTL.forEach(info => {
          shippingInformation.progresses.push({
            time: `${info.SCAN_DM.substr(0, 4)}-${info.SCAN_DM.substr(
              4,
              2
            )}-${info.SCAN_DM.substr(6, 2)}T${info.SCAN_DM.substr(
              8,
              2
            )}:${info.SCAN_DM.substr(10, 2)}:00+09:00`,
            status: {
              id: STATUS_ID_MAP[info.SCANGB_NM] || 'in_transit',
              text: info.SCANGB_NM,
            },
            location: { name: info.SCAN_USER_NM },
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
    name: '한서호남택배',
    tel: '+8218770572',
  },
  getTrack,
};
