import { useContext } from 'react';
import { FeaturesContext } from './featureTypes';

export const useFeatures = () => useContext(FeaturesContext);
