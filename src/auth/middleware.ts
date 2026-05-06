import jwt from 'jsonwebtoken';

export async function authenticateUser(req: Request | any) {
  // Support both Fetch API Request and Node/Express-like request objects
  const headerAuth = typeof (req as Request).headers?.get === 'function'
    ? (req as Request).headers.get('authorization')
    : (req as any).headers?.authorization;

  const token = headerAuth?.split(' ')[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    return decoded;
  } catch (error) {
    return null;
  }
}

export default authenticateUser;
