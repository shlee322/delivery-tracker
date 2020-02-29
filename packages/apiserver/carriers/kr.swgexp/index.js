const axios = require('axios')
const qs = require('querystring')
const { JSDOM } = require('jsdom')
function getTrack(trackId) {

  return new Promise((resolve, reject) => {
    axios.get("http://www.swgexp.com/main/main.asp")
    .then(resp => {
      var cookies = resp.headers['set-cookie'][0];
      var data = {
        shipping_no: trackId,
        loading_no: "",
      };
      axios.post("http://system.swgexp.com/common/tracking.asp", qs.stringify(data), {
        headers: {
          'Content-Type': "application/x-www-form-urlencoded",
          'Cookie': cookies
        }
      }).then(res => {
        const dom = new JSDOM(res.data);
        const document = dom.window.document;
        const table = document.querySelectorAll('table[bgcolor="#ffffff"]')[0];
        if ( table === undefined ) {
          return reject({
            code: 404,
            message: '운송장이 등록되지 않았거나 업체에서 상품을 준비중이니 업체로 문의해주시기 바랍니다.'
          });
        }
        const contents = table.querySelectorAll('tr');
        const progresses = document.querySelectorAll('table[class="form_list"] tbody')[1].querySelectorAll('tr[bgcolor="#ffffff"]');

        const shippingInformation = {
        	from: {
        		name: contents[2].querySelector('td[class="pl30"]').textContent,
        		time: null,
        	},
        	to: {
        		name: contents[6].querySelector('td[class="pl30"]').textContent,
        		time: null,
        	},
        	state: {
        		id: null,
        		text: '',
        	},
        	progresses: []
        }
        progresses.forEach(element => {
        	shippingInformation.progresses.push({
        		time: element.querySelector('td[class="linel2 ac"]').textContent,
        		location: element.querySelectorAll('td[class="ac"]')[0].textContent,
        		status: element.querySelectorAll('td[class="ac"]')[1].textContent,
        		description: element.querySelector('td[class="pl10"]').textContent
        	});
        });
        shippingInformation.state.id = shippingInformation.progresses[shippingInformation.progresses.length - 1].status;
        shippingInformation.state.text = shippingInformation.progresses[shippingInformation.progresses.length - 1].description;
        resolve(shippingInformation);
        
      })
    }).catch(err => reject(err));
  });
}

module.export = {
  info: {
    name: '성원글로벌카고',
    tel: "+82327469984",
  },
  getTrack: getTrack,
}
