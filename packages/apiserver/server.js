#!/usr/bin/env node

const express = require('express');
const app = require('./app.js');

app(express()).listen(process.env.PORT || 8080);
