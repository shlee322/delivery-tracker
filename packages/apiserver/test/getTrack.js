/* eslint-disable */
const assert = require('assert');

function testTrackInfo(testTarget, info, done) {
  done();
}

describe('Carrier', function() {
  describe('getTrack', function() {
    /*
    TRACKING_TEST_CASE Env Example
    TRACKING_TEST_CASE="[{\"carrier\":\"kr.cjlogistics\",\"trackId\":\"0000000000\"},{\"carrier\":\"kr.cjlogistics\",\"trackId\":\"123456789012\",\"errorCode\":404}]"
    */
    assert.notStrictEqual(process.env.TRACKING_TEST_CASE, undefined, 'required process.env.TRACKING_TEST_CASE');
    const testCase = JSON.parse(process.env.TRACKING_TEST_CASE);
    testCase.forEach(testTarget => {
      it(testTarget.carrier, done => {
        require(`../carriers/${testTarget.carrier}`)
          .getTrack(testTarget.trackId)
          .then(info => {
            if (testTarget.errorCode !== undefined) return done(info);
            return testTrackInfo(testTarget, info, done);
          })
          .catch(err => {
            if (testTarget.errorCode === undefined) return done(err);
            if (testTarget.errorCode !== err.code) return done(err);
            done();
          });
      }).timeout(5000);
    });
  });
});
