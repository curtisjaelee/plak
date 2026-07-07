import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute } from 'amazon-cognito-identity-js';
import { cognitoConfig } from './cognitoConfig';

const userPool = new CognitoUserPool(cognitoConfig);

export function signUp(email, password, name, inviteCode) {
  return new Promise((resolve, reject) => {
    const attributeList = [];
    if (inviteCode) {
      attributeList.push(
        new CognitoUserAttribute({ Name: 'custom:invite_code', Value: inviteCode })
      );
    }
    userPool.signUp(email, password, attributeList, null, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function confirmSignUp(email, code) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    user.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function login(email, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool });
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

export function getCurrentUser() {
  return userPool.getCurrentUser();
}
export function getIdToken() {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) {
      reject(new Error('Not logged in'));
      return;
    }
    user.getSession((err, session) => {
      if (err) reject(err);
      else resolve(session.getIdToken().getJwtToken());
    });
  });
}