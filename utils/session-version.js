function isValidSessionIdentity(identity) {
  return Boolean(
    identity &&
    typeof identity === 'object' &&
    typeof identity.id === 'string' &&
    identity.id.length > 0 &&
    Number.isInteger(identity.sessionVersion) &&
    identity.sessionVersion >= 0
  );
}

module.exports = { isValidSessionIdentity };
