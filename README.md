# Delivery Tracker
[![Build Status](https://travis-ci.org/shlee322/delivery-tracker.svg?branch=master)](https://travis-ci.org/shlee322/delivery-tracker)

Delivery and Shipping Tracking Service

# Usage
## Cloud
Document : https://tracker.delivery/guide/

## Self-Hosting

### Install
```
npm install -g delivery-tracker-apiserver delivery-tracker-client
```

### Run API Server
```
NODE_ENV=production PORT=8080 delivery-tracker-apiserver
```

### Run Client (not ready yet)
```
NODE_ENV=production PORT=8888 API_ENDPOINT='http://127.0.0.1:8080' delivery-tracker-client
```

## License
- Please read the `LICENSE` file.

## Collaborators
- [@shlee322](https://github.com/shlee322)
- [@zinozzino](https://github.com/zinozzino)
