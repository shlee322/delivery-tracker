# API Server
## Track API
배송 조회 API 입니다. 모든 필드는 택배사에 따라 생략 될 수 있습니다.
```javascript
{
  "from": {
    "name": "Test",
    "time": "2018-01-01T00:00:00+09:00"
  },
  "to": {
    "name": "Test",
    "time": "2018-01-01T00:00:00+09:00"
  },
  "state": {
    "id": "information_received | at_pickup | in_transit | out_for_delivery | delivered",
    "text": "상품준비중 | 상품인수 | 상품이동중 | 배송출발 | 배송완료"
  },
  "item": "테스트 상품",
  "progresses": [
    {
      "time": "2018-01-01T00:00:00+09:00",
      "location": {
        "name": ""
      },
      "status": {
        "text": ""
      },
      "description": ""
    }
  ]
}
```
