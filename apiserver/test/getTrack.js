var assert = require('assert');

let testCase = [
  { carrier: 'kr.cjlogistics', trackId: '000000000000'},
  { carrier: 'kr.cjlogistics', trackId: '123456789012', errorCode: 404 },
  { carrier: 'kr.cvsnet', trackId: '1111111111' },
  { carrier: 'kr.cvsnet', trackId: '0123456789', errorCode: 404 },
  { carrier: 'kr.epost', trackId: '1234567890123' },
  { carrier: 'kr.epost', trackId: '1231231231231', errorCode: 404 },
  { carrier: 'kr.hanjin', trackId: '0000000000' },
  { carrier: 'kr.hanjin', trackId: '0123456782', errorCode: 404 },
  { carrier: 'kr.logen', trackId: '00000000000' },
  { carrier: 'kr.logen', trackId: '12345678901', errorCode: 404 },
  { carrier: 'kr.lotte', trackId: '000000000000' },
  { carrier: 'kr.lotte', trackId: '1234567890123', errorCode: 404 },
]

function testTrackInfo(testTarget, info, done)
{
  done();
}

describe('Carrier', function() {
  describe('getTrack', function() {
    testCase.forEach(testTarget => {
      it(testTarget.carrier, (done) => {
        require('../carriers/' + testTarget.carrier).getTrack(testTarget.trackId).then(info => {
          if(testTarget.errorCode !== undefined) return done(info);
          return testTrackInfo(testTarget, info, done);
        }).catch(err => {
          if(testTarget.errorCode === undefined) return done(err);
          if(testTarget.errorCode !== err.code) return done(err);
          done();
        });
      }).timeout(5000);
    });
  });
});
