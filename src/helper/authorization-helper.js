export default function extractToken(authorization) {
  return (authorization && authorization.length && authorization.split(' ')[1]);
}
