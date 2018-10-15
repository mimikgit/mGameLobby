import Router from 'router';
import Action from 'action-js';
import ApiError from './helper/api-error';
import extractToken from './helper/authorization-helper';
import { toJson, mapJsonToItem } from './helper/json-helper';

const app = Router({ mergeParams: true });

const GAME_STATUS_KEY = 'game.status';

// Initialize mimik serverless api
mimikModule.exports = (context, req, res) => {
  req.mimikContext = context;
  res.writeError = (apiError) => {
    res.statusCode = apiError.code;
    const json = JSON.stringify({
      code: apiError.code,
      message: apiError.message,
    });
    res.end(json);
  };

  app(req, res, (e) => {
    const err = (e && new ApiError(400, e.message)) ||
      new ApiError(404, 'not found');
    res.writeError(err);
  });
};

// GET Player's Current Status
app.get('/current', (req, res) => {
  const { storage } = req.mimikContext;
  const item = storage.getItem(GAME_STATUS_KEY);

  if (!item) {
    const na = { status: 'na' };
    res.end(JSON.stringify(na, null, 2));
    return;
  }

  res.end(item);
});

// POST Player's Current Status
app.post('/current', (req, res) => {
  const { storage } = req.mimikContext;

  if (!req.body) {
    res.writeError(new ApiError('missing JSON body'));
    return;
  }

  new Action((cb) => {
    const item = mapJsonToItem(req.body);
    if (!item) {
      cb(new Error('invalid item'));
    } else {
      item.updateTime = new Date(Date.now()).toISOString();
      cb(item);
    }
  })
    .next((item) => {
      const json = JSON.stringify(item);
      storage.setItem(GAME_STATUS_KEY, json);
      return item;
    })
    .next((item) => {
      const json = toJson(item);
      res.end(json);
    })
    .guard((e) => {
      res.writeError(new ApiError(400, e.message));
    })
    .go();
});

// GET All Players' Game Status in Local Network
app.get('/games', (req, res) => {
  const accessToken = extractToken(req.authorization);
  const edgeUrl = 'http://localhost:8083/mds/v1';
  const context = req.mimikContext;

  new Action((cb) => {
    context.http.request(({
      url: `${edgeUrl}/nodes?clusters=linkLocal`,
      success: (r) => {
        const nodes = JSON.parse(r.data);
        const encryptedJson = JSON.stringify(nodes.data);
        context.edge.decryptEncryptedNodesJson({
          type: 'local',
          data: encryptedJson,
          token: accessToken,
          success: (result) => { cb(result.data); },
          error: (err) => { cb(new Error(err.message)); },
        });
      },
      error: (err) => {
        cb(new Error(err.message));
      },
    }));
  })
    .next((json) => {
      const data = JSON.parse(json);
      if (data && data.localLinkNetwork && data.localLinkNetwork.nodes) {
        const nodes = data.localLinkNetwork.nodes;
        return nodes;
      }
      return [];
    })
    .next((localNodes) => {
      const gameNodes = localNodes.filter((node) => {
        const services = node.services.filter((s) => {
          const type = s.serviceType;
          return type === 'games-v1';
        });
        return services.length;
      });

      const sgameNodes = gameNodes.map((node) => {
        const n = {
          id: node.id,
          attributes: node.attributes,
          href: node.addresses[0].url.href,
        };
        return n;
      });

      const gameStatusAction = sgameNodes.map((node) => {
        const action = new Action((cb) => {
          const url = `${node.href}/games/v1/current`;
          context.http.request(({
            url,
            success: (r) => { cb(r.data); },
            error: (err) => { if (err) cb('{}'); },
          }));
        })
          .next((json) => {
            try {
              const status = JSON.parse(json);
              return ({ ...node, game: status });
            } catch (err) {
              return {};
            }
          });
        return action;
      });

      return Action.parallel(gameStatusAction);
    })
    .next((data) => {
      const response = JSON.stringify(data, null, 2);
      res.end(response);
    })
    .guard((err) => {
      res.end(err.message);
    })
    .go();
});
