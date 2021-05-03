const axios = require('axios');
const cheerio = require('cheerio');
const Entities = require('html-entities').XmlEntities;
// const { JSDOM } = require('jsdom')
const qs = require('querystring');
const FormData = require('form-data');

function parseStatus(s) {
  if (s.includes('집하완료')) return { id: 'at_pickup', text: '상품인수' };
  if (s.includes('배달준비'))
    return { id: 'out_for_delivery', text: '배송출발' };
  if (s.includes('배달완료')) return { id: 'delivered', text: '배송완료' };
  if (s.includes('신청취소')) return { id: 'canceled', text: '취소' };
  if (s.includes('미배달')) return { id: 'troubled', text: '미배달' };
  return { id: 'in_transit', text: '이동중' };
}

function getCourier(tr) {
  const fncDetailInfoLink = tr.find(`a[href^="javascript:fncDetailInfo("]`);
  if (fncDetailInfoLink.length) {
    const detailHref = fncDetailInfoLink.attr('href');
    const detailScript = detailHref.replace(
      // eslint-disable-next-line no-script-url
      'javascript:fncDetailInfo',
      'fncDetailInfo'
    );
    // eslint-disable-next-line no-new-func
    const fn = new Function(`function fncDetailInfo(RegiNo, DelivYmd, type, EventPocd, delivSeq, delivRdCnt, delivDoneCnt) {
  return {
    RegiNo: RegiNo,
    DelivYmd: DelivYmd,
    type: type,
    EventPocd: EventPocd,
    delivSeq: delivSeq,
    delivRdCnt: delivRdCnt,
    delivDoneCnt: delivDoneCnt
  }
};
return ${detailScript}`);
    const detailInfo = fn();
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append(
        'target_command',
        'kpl.tts.tt.fmt.cmd.RetrieveCmsDetailInfoCMD'
      );
      form.append('JspURI', '/xtts/tt/epost/trace/sttfmt03p09.jsp');
      form.append('RegiNo', detailInfo.RegiNo);
      form.append('DelivYmd', detailInfo.DelivYmd);
      form.append('EventPocd', detailInfo.EventPocd);
      form.append('delivSeq', detailInfo.delivSeq);
      form.append('delivRdCnt', 0);
      form.append('delivDoneCnt', 0);
      form.append('pageNo', 1);
      form.append('pageSize', 10);
      axios
        .post(
          'https://trace.epost.go.kr/xtts/servlet/kpl.tts.common.svl.VisSVL',
          form,
          { headers: form.getHeaders() }
        )
        .then(res => {
          const $ = cheerio.load(res.data);
          const courierName = $('table tbody tr td:nth-child(4)')
            .text()
            .trim();
          const courierContact = $('table tbody tr td:nth-child(5)')
            .text()
            .trim();
          resolve({ name: courierName, contact: courierContact });
        })
        .catch(err => reject(err));
    });
  }
  return null;
}

function getTrack(trackId) {
  const trimString = s => {
    return s.replace(/([\n\t]{1,}|\s{2,})/g, ' ').trim();
  };

  return new Promise((resolve, reject) => {
    axios
      .post(
        'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm',
        qs.stringify({
          sid1: trackId,
        })
      )
      .then(res => {
        // const dom = new JSDOM(res.data)
        // const document = dom.window.document

        const $ = cheerio.load(res.data);

        // const informationTable = document.querySelector('.table_col:nth-child(2)')
        // const progressTable = document.querySelector('.table_col:nth-child(1)')

        const $informationTable = $('.table_col:nth-child(2)');
        const $progressTable = $('.table_col:nth-child(1)');

        return { $, $informationTable, $progressTable };
      })
      .then(({ $, $informationTable, $progressTable }) => {
        // const informations = informationTable.querySelectorAll('td')
        const $informations = $informationTable.find('td');
        const entities = new Entities();

        const from = entities.decode($informations.eq(0).html()).split('<br>');
        const to = entities.decode($informations.eq(2).html()).split('<br>');

        // const from = informations[0].innerHTML.split('<br>')
        // const to = informations[1].innerHTML.split('<br>')

        if ($informations.length === 0) {
          reject({
            code: 404,
            message: '해당 운송장이 존재하지 않습니다.',
          });
        }

        if ($informationTable.find('tr').length === 3) {
          reject({
            code: 404,
            message: trimString(
              $informationTable
                .find('tr:nth-child(2)')
                .eq(0)
                .text()
            ),
          });
        }
        const shippingInformation = {
          from: {
            name: from[0],
            time: from[1]
              ? `${from[1].replace(/\./g, '-')}T00:00:00+09:00`
              : null,
          },
          to: {
            name: to[0],
            time: to[1] ? `${to[1].replace(/\./g, '-')}T00:00:00+09:00` : null,
          },
          state: null,
          progresses: [],
        };

        let courierPromise;

        $progressTable.find('tr').each((_, element) => {
          const tr = $(element);
          const td = tr.find('td');
          if (td.length === 0) {
            return;
          }
          shippingInformation.progresses.push({
            time: `${td
              .eq(0)
              .html()
              .replace(/\./g, '-')}T${td.eq(1).html()}:00+09:00`,
            location: {
              name: td
                .eq(2)
                .find('a')
                .eq(0)
                .text(),
            },
            status: parseStatus(td.eq(3).text()),
            description: trimString(td.eq(3).text()),
          });
          const courier = getCourier(tr);
          if (courier) {
            courierPromise = courier;
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
        if (courierPromise) {
          courierPromise.then(courier => {
            shippingInformation.courier = courier;
            resolve(shippingInformation);
          });
        } else {
          resolve(shippingInformation);
        }
      })
      .catch(err => reject(err));
  });
}

module.exports = {
  info: {
    name: '우체국 택배',
    tel: '+8215881300',
  },
  getTrack,
};
