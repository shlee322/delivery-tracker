# Delivery Tracker

Delivery and Shipping Tracking Service

## Usage
### Cloud (Managed Service)
Visit : https://tracker.delivery

### Self-Hosted
#### Setting Up the Development Environment
Delivery Tracker can be set up in local development environments and is also readily available for setup through GitHub Codespaces.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/shlee322/delivery-tracker)

Follow the instructions below for GitHub Codespaces:

1. Click the "Open in GitHub Codespaces" button above to create a new Codespace.
2. Once in your Codespace terminal, enter `pnpm install` to install the necessary dependencies.
3. In GitHub Codespaces, navigate to the "Run and Debug" section from the sidebar and then click the "Run" button for "@delivery-tracker/server" to launch the server.
4. The service URL can be accessed via the Ports panel at the bottom of the GitHub Codespaces interface.

#### Deploying Self-Hosted Services
See `Dockerfile`

## Additional Information
### License
- Please read the `LICENSE` file.

### Contact
- Please contact `contact@tracker.delivery` for more information.

### Project Structure
- packages/api : GraphQL API
- packages/core : Scraper code
- packages/cli : A Command Line Interface (CLI) tool that uses the execute function from packages/api.
- packages/http : A self-hosted GraphQL HTTP server that uses the execute function from packages/api.

### Request additional carriers
See https://tracker.delivery/request-additional-carrier
